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
import { DEFAULT_PAGE_LIMIT } from 'src/constants';
import Big from 'big.js';

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    @InjectRepository(Token)
    private readonly tokenRepo: Repository<Token>,
  ) {}

  @Cron('*/30 * * * * *')
  async handleCron() {
    this.logger.verbose('handleCron');

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
      const uniqueTokensFiltered: {
        [key: string]: { decimal: number; symbol: string; price: string };
      } = uniqueTokensIds.reduce(
        (
          acc: {
            [key: string]: { decimal: number; symbol: string; price: string };
          },
          id: string,
        ) => {
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
      ].map(
        ([key, value]: [
          key: string,
          value: { decimal: number; symbol: string; price: string },
        ]) => {
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

  async calculatePrices(
    poolsFromJumbo,
    jumboPrice,
    nearFiatPrice: string,
  ): Promise<{
    [key: string]: { price: string; volume: string; token: Token };
  }> {
    const jumboAddress = configService.getJumboTokenId();
    const nearAddress = configService.getNearTokenId();

    const newPrices = {};
    for (const pool in poolsFromJumbo) {
      const isNearFiat = poolsFromJumbo[pool].token_account_ids.includes(
        configService.getNearTokenId(),
      );
      const fiatPrice = isNearFiat ? nearFiatPrice : jumboPrice;
      const fiatId = isNearFiat ? nearAddress : jumboAddress;

      const [price, token] = await this.calculatePriceForPool(
        poolsFromJumbo[pool],
        fiatPrice,
        fiatId,
      );

      const calculatedVolume = calculateVolume(poolsFromJumbo[pool].supplies, {
        [token.id]: price,
        [fiatId]: fiatPrice,
      });
      if (Big(calculatedVolume).eq(0) || Big(calculatedVolume).lt(1000))
        continue;

      if (
        !newPrices[token.id] ||
        Big(calculatedVolume).gt(newPrices[token.id]?.volume || 0)
      ) {
        newPrices[token.id] = { price, volume: calculatedVolume, token };
      }
    }
    return newPrices;
  }

  async calculatePriceForPool(
    pool,
    fiatPrice,
    fiatTokenId = configService.getNearTokenId(),
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
