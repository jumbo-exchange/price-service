import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { Repository } from 'typeorm';
import Big from 'big.js';

import { Token } from './token.entity';
import { configService } from '../config.service';
import { initializeNearConnection } from '../near-connection';
import {
  calculatePriceForToken,
  calculateVolume,
  formatTokenAmount,
} from '../helpers';
import {
  DEFAULT_PAGE_LIMIT,
  EMPTY_POOL_VOLUME,
  LOW_LIQUIDITY_POOL_VOLUME,
} from '../constants';
import { TokenData } from '../interfaces';

interface Pool {
  id: number;
  amounts: string[];
  token_account_ids: string[];
  supplies: { [key: string]: string };
  total_fee: string;
}

@Injectable()
export class TokenService implements OnModuleInit {
  private readonly logger = new Logger(TokenService.name);
  private near: Awaited<ReturnType<typeof initializeNearConnection>>;

  constructor(
    @InjectRepository(Token)
    private readonly tokenRepo: Repository<Token>,
  ) {}

  async onModuleInit() {
    this.near = await initializeNearConnection();
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async handleCron() {
    try {
      const nearAddress = configService.getNearTokenId();
      const jumboAddress = configService.getJumboTokenId();
      const tokenPrices = await this.requestData();
      const filteredTokens = Object.entries(tokenPrices);
      const [nearFiatPrice, poolsFromJumbo] = await Promise.all([
        this.requestNearPrice(),
        this.getDataFromPools(),
      ]);

      const [jumboPrice] = await this.calculateJumboPrice(
        poolsFromJumbo,
        nearFiatPrice,
      );
      const filterPoolsByIds = poolsFromJumbo.filter(
        ({ token_account_ids }) =>
          token_account_ids.includes(nearAddress) ||
          token_account_ids.includes(jumboAddress),
      );

      const newPrices = await this.calculatePrices(
        filterPoolsByIds,
        jumboPrice,
        nearFiatPrice,
      );
      const newIds = Object.keys(newPrices);

      const uniqueTokensIds = newIds.filter((id) => !tokenPrices[id]);
      const uniqueTokensFiltered = uniqueTokensIds.reduce(
        (acc: { [key: string]: TokenData }, id: string) => {
          acc[id] = {
            decimal: newPrices[id].token.decimal,
            symbol: newPrices[id].token.symbol,
            price: newPrices[id].price,
          };
          return acc;
        },
        {},
      );

      const filteredUniqueTokens = Object.entries(uniqueTokensFiltered);

      const newTokens: Token[] = [
        ...filteredTokens,
        ...filteredUniqueTokens,
      ].map(([key, value]: [key: string, value: TokenData]) => {
        const token = new Token();
        this.logger.log(`Token ${key} updated`);
        token.id = key;
        token.decimal = value.decimal;
        token.symbol = value.symbol;
        if (newPrices[key] && Number(newPrices[key].price) > 0) {
          this.logger.log(
            `with internal price ${newPrices[key].price} (external ${value.price})`,
          );
          token.price = newPrices[key].price;
        } else {
          this.logger.log(`with external price ${value.price}`);
          token.price = value.price;
        }

        token.updatedAt = new Date();
        this.logger.log(`----------------`);

        return token;
      });

      await this.tokenRepo.save(newTokens);
    } catch (e) {
      this.logger.error(`Cron job error: ${e}`);
    }
  }

  async requestData() {
    try {
      const priceServiceUrl = configService.getPriceServiceUrl();
      const tokenResults = await axios.get(priceServiceUrl);
      return tokenResults.data;
    } catch (e) {
      this.logger.warn(`Data request error from price service: ${e}`);
      return [];
    }
  }

  async requestNearPrice() {
    try {
      const nearHelperUrl = configService.getHelperUrl();
      const nearData = await axios.get(`${nearHelperUrl}/fiat`);
      return nearData.data.near.usd;
    } catch (e) {
      this.logger.warn(`Data request error from helper: ${e}`);
    }
  }

  private async getPoolsPage(
    service,
    from: number,
    limit: number = DEFAULT_PAGE_LIMIT,
  ): Promise<Pool[]> {
    try {
      const poolPage = await service.viewFunction('get_pools', {
        from_index: from,
        limit: limit,
      });
      return poolPage.map((pool) => {
        pool.supplies = pool.amounts.reduce(
          (acc: { [tokenId: string]: string }, amount: string, i: number) => {
            acc[pool.token_account_ids[i]] = amount;
            return acc;
          },
          {},
        );
        return pool;
      });
    } catch (e) {
      this.logger.warn(`Data request error from getting pool page: ${e}`);
      return [];
    }
  }

  async getDataFromPools() {
    try {
      const connection = await this.near;
      const length = await connection.viewFunction('get_number_of_pools');
      const pages = Math.ceil(length / DEFAULT_PAGE_LIMIT);
      const pools = await Promise.all(
        [...Array(pages)].map((_, i) =>
          this.getPoolsPage(connection, i * DEFAULT_PAGE_LIMIT),
        ),
      );

      return pools.flat();
    } catch (e) {
      this.logger.warn(`Data request error from pools: ${e}`);
      return [];
    }
  }

  async calculatePrices(
    poolsFromJumbo: Pool[],
    jumboPrice: string,
    nearFiatPrice: string,
  ): Promise<{
    [key: string]: { price: string; volume: string; token: Token };
  }> {
    const jumboAddress = configService.getJumboTokenId();
    const nearAddress = configService.getNearTokenId();
    const newPrices = {};
    const poolsPrices: Array<{
      price: string;
      volume: string;
      token: Token;
    }> = await Promise.all(
      poolsFromJumbo.map((pool) =>
        this.calculatePriceForPool(
          pool,
          nearFiatPrice,
          jumboPrice,
          nearAddress,
          jumboAddress,
        ),
      ),
    );

    for (const pool in poolsPrices) {
      const poolEntity = poolsPrices[pool];
      const previousEntity = newPrices[poolEntity.token.id];
      const { volume } = poolEntity;
      if (
        Big(volume).eq(EMPTY_POOL_VOLUME) ||
        Big(volume).lt(LOW_LIQUIDITY_POOL_VOLUME)
      )
        continue;

      if (!previousEntity || Big(volume).gt(previousEntity.volume))
        newPrices[poolEntity.token.id] = poolEntity;
    }

    return newPrices;
  }

  async calculatePriceForPool(
    pool: Pool,
    nearFiatPrice: string,
    jumboPrice: string,
    nearAddress: string,
    jumboAddress: string,
  ): Promise<{
    price: string;
    volume: string;
    token: Token;
  }> {
    const isNearFiat = pool.token_account_ids.includes(
      configService.getNearTokenId(),
    );
    const fiatPrice = isNearFiat ? nearFiatPrice : jumboPrice;
    const fiatId = isNearFiat ? nearAddress : jumboAddress;

    const [price, token] = await this.calculatePriceFromPool(
      pool,
      fiatPrice,
      fiatId,
    );

    const calculatedVolume = calculateVolume(pool.supplies, {
      [token.id]: price,
      [fiatId]: fiatPrice,
    });

    return { price, volume: calculatedVolume, token };
  }

  async calculatePriceFromPool(
    pool: Pool,
    fiatPrice: string,
    fiatTokenId: string = configService.getNearTokenId(),
  ): Promise<[string, Token]> {
    const [firstToken, secondToken] = pool.token_account_ids;
    const [fiatToken, fungibleToken] =
      firstToken === fiatTokenId
        ? [firstToken, secondToken]
        : [secondToken, firstToken];
    const tokenMetadata: Token = await this.tryGetToken(fungibleToken);
    const fiatTokenMetadata = await this.tryGetToken(fiatToken);

    const fiatAmount = pool.supplies[fiatToken];
    const fungibleTokenAmount = pool.supplies[fungibleToken];

    const fiatAmountInDecimals = formatTokenAmount(
      fiatAmount,
      fiatTokenMetadata.decimal,
      0,
    );
    const fungibleTokenAmountInDecimals = formatTokenAmount(
      fungibleTokenAmount,
      tokenMetadata.decimal,
      0,
    );
    return [
      calculatePriceForToken(
        fiatAmountInDecimals,
        fungibleTokenAmountInDecimals,
        fiatPrice,
      ),
      tokenMetadata,
    ];
  }

  async tryGetToken(fungibleToken: string): Promise<Token> {
    const token = await this.findOne(fungibleToken);

    if (!token) {
      const connection = await this.near;
      const tokenMetadata = await connection.getFtMetadata(fungibleToken);
      const newToken = new Token();

      newToken.id = fungibleToken;
      newToken.decimal = tokenMetadata.decimals;
      newToken.symbol = tokenMetadata.symbol;
      newToken.updatedAt = new Date();
      newToken.price = '0';
      await this.tokenRepo.save(newToken);

      return newToken;
    }

    return token;
  }

  calculateJumboPrice(poolsFromJumbo: Pool[], nearPrice: string) {
    const pool = poolsFromJumbo.find(
      (pool) => pool.id === Number(configService.getJumboPoolId()),
    );

    return this.calculatePriceFromPool(pool, nearPrice);
  }

  async findAll(): Promise<Token[]> {
    return this.tokenRepo.find();
  }

  async findOne(id: string): Promise<Token> {
    return this.tokenRepo.findOne(id);
  }
}
