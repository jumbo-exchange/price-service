import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { Repository } from 'typeorm';

import { Token } from './token.entity';
import { configService } from '../config.service';
import initializeNearService from 'src/nearService';
import {
  assertFulfilled,
  calculatePriceForToken,
  calculateVolume,
  formatTokenAmount,
} from 'src/helpers';
import { DEFAULT_PAGE_LIMIT, NEAR_DECIMALS } from 'src/constants';
import Big from 'big.js';

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    @InjectRepository(Token)
    private readonly tokenRepo: Repository<Token>,
  ) {}

  @Cron('*/10 * * * * *')
  async handleCron() {
    this.logger.verbose('handleCron');

    try {
      const nearAddress = configService.getNearTokenId();
      const jumboAddress = configService.getJumboTokenId();
      const tokenPrices = await this.requestData();
      const filteredTokens = Object.entries(tokenPrices);
      const nearFiatPrice = await this.requestNearPrice();
      const poolsFromJumbo = await this.getDataFromPools();
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

      Object.entries(newPrices).map(([key, value]) =>
        this.logger.log(`OPPPAS ${key} ${JSON.stringify(value)}`),
      );

      const newTokens: Token[] = filteredTokens.map(
        ([key, value]: [
          key: string,
          value: { decimal: number; symbol: string; price: string },
        ]) => {
          this.logger.log(
            `Token accountId=${key} symbol=${value.symbol} decimals=${value.decimal} price=${value.price}`,
          );
          const token = new Token();
          token.id = key;
          token.decimal = value.decimal;
          token.symbol = value.symbol;
          token.price = value.price;
          token.updatedAt = new Date();

          return token;
        },
      );

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
    }
  }

  async requestNearPrice() {
    try {
      const nearHelperUrl = configService.getHelperUrl();
      const nearData = await axios.get(`${nearHelperUrl}/fiat`);
      this.logger.warn(`Data from helper: ${nearData.data.near.usd}`);

      return nearData.data.near.usd;
    } catch (e) {
      this.logger.warn(`Data request error from helper: ${e}`);
    }
  }

  async getDataFromPools() {
    try {
      const service = await initializeNearService();
      const length = await service.viewFunction('get_number_of_pools');
      const pages = Math.ceil(length / DEFAULT_PAGE_LIMIT);
      const pools = await Promise.allSettled(
        [...Array(pages)].map((_, i) =>
          service.viewFunction('get_pools', {
            from_index: i * DEFAULT_PAGE_LIMIT,
            limit: DEFAULT_PAGE_LIMIT,
          }),
        ),
      );
      return pools
        .filter(assertFulfilled)
        .map(({ value }) => value)
        .flat()
        .map((pool) => {
          return {
            ...pool,
            supplies: pool.amounts.reduce(
              (
                acc: { [tokenId: string]: string },
                amount: string,
                i: number,
              ) => {
                acc[pool.token_account_ids[i]] = amount;
                return acc;
              },
              {},
            ),
          };
        });
    } catch (e) {
      this.logger.warn(`Data request error from pools: ${e}`);
      return [];
    }
  }

  async calculatePrices(poolsFromJumbo, jumboPrice, nearFiatPrice: string) {
    const jumboAddress = configService.getJumboTokenId();
    const nearAddress = configService.getNearTokenId();

    const newPrices = {};
    for (const pool in poolsFromJumbo) {
      const isNearFiat = poolsFromJumbo[pool].token_account_ids.includes(
        configService.getNearTokenId(),
      );
      const fiatPrice = isNearFiat ? nearFiatPrice : jumboPrice;
      const fiatId = isNearFiat ? nearAddress : jumboAddress;

      const [price, tokenId] = await this.calculatePriceForPool(
        poolsFromJumbo[pool],
        fiatPrice,
        fiatId,
      );

      // const [price, tokenId] = [
      //   '10',
      //   item.token_account_ids.find((el) => el !== fiatId),
      // ];

      const calculatedVolume = calculateVolume(poolsFromJumbo[pool].supplies, {
        [tokenId]: price,
        [fiatId]: fiatPrice,
      });

      this.logger.log(
        `What ${calculatedVolume} ${tokenId} ${
          Object.entries(newPrices).length
        }`,
      );

      if (
        !newPrices[tokenId] ||
        Big(calculatedVolume).gt(newPrices[tokenId]?.volume || 0)
      ) {
        newPrices[tokenId] = { price, volume: calculatedVolume };
      }
    }
    return newPrices;
  }

  async calculatePriceForPool(
    pool,
    fiatPrice,
    fiatTokenId = configService.getNearTokenId(),
  ) {
    if (!pool.token_account_ids.includes(fiatTokenId)) return '0';

    const [firstToken, secondToken] = pool.token_account_ids;
    const [fiatToken, fungibleToken] =
      firstToken === configService.getNearTokenId()
        ? [firstToken, secondToken]
        : [secondToken, firstToken];
    const token = await this.tryGetToken(fungibleToken);

    const fiatNearAmount = pool.supplies[fiatToken];
    const fungibleTokenAmount = pool.supplies[fungibleToken];

    const fiatNearAmountInDecimals = formatTokenAmount(
      fiatNearAmount,
      NEAR_DECIMALS,
      0,
    );
    const fungibleTokenAmountInDecimals = formatTokenAmount(
      fungibleTokenAmount,
      token.decimal,
      0,
    );

    return [
      calculatePriceForToken(
        fiatNearAmountInDecimals,
        fungibleTokenAmountInDecimals,
        fiatPrice,
      ),
      fungibleToken,
    ];
  }

  async tryGetToken(fungibleToken): Promise<Token> {
    const tokens = await this.findAll();
    const token = tokens.find((el) => el.id === fungibleToken);

    if (!token) {
      const service = await initializeNearService();
      const tokenMetadata = await service.getFtMetadata(fungibleToken);
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

  calculateJumboPrice(poolsFromJumbo, nearPrice) {
    const pool = poolsFromJumbo.find(
      (pool) => pool.id === Number(configService.getJumboPoolId()),
    );

    return this.calculatePriceForPool(pool, nearPrice);
  }

  async findAll(): Promise<Token[]> {
    return this.tokenRepo.find();
  }
}
