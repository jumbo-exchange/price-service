import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { InMemoryCache } from 'apollo-cache-inmemory';
import ApolloClient from 'apollo-client';
import { HttpLink } from 'apollo-link-http';
import Big from 'big.js';
import gql from 'graphql-tag';
import { Repository } from 'typeorm';
import fetch from 'cross-fetch';

import { Pool } from './pool.entity';
import { configService } from '../config.service';
import { ContractPool, Swap } from '../interfaces';

import { TokenService } from '../token/token.service';
import { DEFAULT_PAGE_LIMIT } from '../constants';
import { initializeNearConnection } from '../near-connection';
import { formatTokenAmount } from '../helpers';

const HOUR_IN_SECONDS = 60 * 60;
const HOURS_IN_DAY = 24;
const MILLISECONDS_IN_HOUR = 60 * 60 * 1000;

export const createClient = (uri: string) =>
  new ApolloClient({
    link: new HttpLink({ uri, fetch: fetch }),
    cache: new InMemoryCache(),
    defaultOptions: {
      query: { fetchPolicy: 'no-cache' },
      watchQuery: { fetchPolicy: 'no-cache' },
    },
  });

export const createQuery = (
  blockTimestamp_lte: string | number,
  blockTimestamp_gte: string | number,
  first = 1000,
  skip = 0,
) => gql`
  query Swaps {
    swaps(
      first: ${first},
      skip: ${skip}
      where: {
        blockTimestamp_gte: ${blockTimestamp_gte.toString()}
        blockTimestamp_lte: ${blockTimestamp_lte.toString()}
      }
      orderBy: blockTimestamp
      orderDirection: asc
    ) {
      id
      tokenIn
      tokenInAmount
      poolId
      tokenOut
      tokenOutAmount
      receiptId
      blockTimestamp
    }
  }
`;

@Injectable()
export class PoolService {
  private readonly logger = new Logger(PoolService.name);
  private apolloClient = createClient(configService.getApolloUrl());
  private near: Awaited<ReturnType<typeof initializeNearConnection>>;

  async onModuleInit() {
    this.near = await initializeNearConnection();
  }

  constructor(
    @Inject(forwardRef(() => TokenService))
    private tokenService: TokenService,
    @InjectRepository(Pool)
    private readonly poolRepo: Repository<Pool>,
  ) {}

  @Cron(CronExpression.EVERY_4_HOURS)
  async handleCron() {
    this.logger.verbose('handleCron for pool service');

    try {
      const [pools, swaps] = await Promise.all([
        this.getDataFromPools(),
        this.requestDataForDay(),
      ]);

      const poolsMap = pools.reduce(
        (acc: { [key: string]: Pool }, pool: ContractPool) => {
          const newPool = new Pool();
          const poolId = pool.id.toString();
          newPool.id = poolId;
          const [firstTokenAddress, secondTokenAddress] =
            pool.token_account_ids;
          newPool.tokenFirst = firstTokenAddress;
          newPool.tokenSecond = secondTokenAddress;
          newPool.volumeFirst = pool.supplies[firstTokenAddress];
          newPool.volumeSecond = pool.supplies[secondTokenAddress];
          newPool.volume24hFirst = '0';
          newPool.volume24hSecond = '0';
          return { ...acc, [poolId]: newPool };
        },
        {},
      );

      const flatSwaps = swaps.flat();
      const newPools: { [key: string]: Pool } = flatSwaps.reduce(
        (acc: { [key: string]: Pool }, swap: Swap) => {
          try {
            const [, poolId] = swap.id?.split(' ');
            if (!poolId) return { ...acc };
            const poolFromAcc = acc[poolId];

            if (poolFromAcc.tokenFirst === swap.tokenIn) {
              poolFromAcc.volume24hFirst = new Big(poolFromAcc.volume24hFirst)
                .add(swap.tokenInAmount)
                .toFixed(0);
            } else {
              poolFromAcc.volume24hSecond = new Big(poolFromAcc.volume24hSecond)
                .add(swap.tokenInAmount)
                .toFixed(0);
            }

            poolFromAcc.updatedAt = new Date();

            acc[poolId] = poolFromAcc;
            return acc;
          } catch (e) {
            this.logger.error(`Error during processing record ${e}`);
            return acc;
          }
        },
        poolsMap,
      );

      await this.poolRepo.save(Object.values(newPools));
    } catch (e) {
      this.logger.error(`Cron job error in pool service: ${e}`);
    }
  }

  async getSwapHourSwaps(startDate, endDate) {
    try {
      const query = createQuery(startDate, endDate);
      const requestData = await this.apolloClient.query({ query });
      return requestData.data.swaps;
    } catch (e) {
      this.logger.error(`Error during requesting the data ${e}`);
      return [];
    }
  }

  async requestDataForDay() {
    try {
      const hourNow = new Date();
      hourNow.setUTCMilliseconds(0);
      hourNow.setUTCSeconds(0);
      hourNow.setUTCMinutes(0);
      const startTimestamp = hourNow.getTime() / 1000;
      const resultsPerDay = Array.from(
        { length: HOURS_IN_DAY },
        (v, i) => startTimestamp - i * HOUR_IN_SECONDS,
      );
      const requests = [];

      for (let i = 0; i < HOURS_IN_DAY - 1; i++) {
        requests.push(
          this.getSwapHourSwaps(resultsPerDay[i], resultsPerDay[i + 1]),
        );
      }

      return Promise.all(requests);
    } catch (e) {
      this.logger.warn(`Data request error: ${e}`);
    }
  }

  async getDailyPoolVolumes(take = 1000, skip = 0): Promise<Pool[]> {
    const [data] = await this.poolRepo.findAndCount({ take, skip });
    const currentDate = Date.now();
    return data.filter((pool) => {
      const poolDate = new Date(pool.updatedAt).getTime();
      return (
        currentDate - poolDate < MILLISECONDS_IN_HOUR * HOURS_IN_DAY &&
        (Big(pool.volume24hFirst).gt(0) || Big(pool.volume24hSecond).gt(0))
      );
    });
  }

  async formatPools(take = 1000, skip = 0) {
    const [pools] = await this.poolRepo.findAndCount({ take, skip });
    const tokens = await this.tokenService.findAll();
    return pools.reduce((acc, pool) => {
      const baseTokenAddress = pool.tokenFirst;
      const quoteTokenAddress = pool.tokenSecond;
      const id = `${baseTokenAddress}_${quoteTokenAddress}`;
      const baseToken = tokens.find((token) => token.id === baseTokenAddress);
      const quoteToken = tokens.find((token) => token.id === quoteTokenAddress);
      if (!baseToken || !quoteToken) return acc;
      const lastPrice = Big(pool.volumeFirst).gt(0)
        ? Big(pool.volumeSecond).div(pool.volumeFirst)
        : 0;
      const baseTokenLiquidity = pool.volumeFirst
        ? Big(formatTokenAmount(pool.volumeFirst, baseToken.decimal)).mul(
            baseToken.price,
          )
        : 0;

      const quoteTokenLiquidity = pool.volumeSecond
        ? Big(formatTokenAmount(pool.volumeSecond, quoteToken.decimal)).mul(
            quoteToken.price,
          )
        : 0;

      const liquidity = Big(baseTokenLiquidity)
        .add(quoteTokenLiquidity)
        .toFixed(5);

      const data = {
        pool_id: pool.id,
        liquidity,
        last_price: lastPrice.toFixed(10),
        base_id: baseTokenAddress,
        base_name: baseToken.symbol,
        base_symbol: baseToken.symbol,
        base_volume: pool.volume24hFirst,
        base_price_usd: baseToken.price,
        base_liquidity: pool.volumeFirst,
        base_liquidity_usd: baseTokenLiquidity,
        quote_id: quoteTokenAddress,
        quote_name: quoteToken.symbol,
        quote_symbol: quoteToken.symbol,
        quote_volume: pool.volume24hSecond,
        quote_price_usd: quoteToken.price,
        quote_liquidity: pool.volumeSecond,
        quote_liquidity_usd: quoteTokenLiquidity,
      };
      return { ...acc, [id]: data };
    }, {});
  }

  async getDataFromPools(): Promise<ContractPool[]> {
    try {
      const blackList = configService.getBlackList();
      const connection = await this.near;
      const length = await connection.viewFunction('get_number_of_pools');
      const pages = Math.ceil(length / DEFAULT_PAGE_LIMIT);
      const pools = await Promise.all(
        [...Array(pages)].map((_, i) =>
          this.getPools(connection, i * DEFAULT_PAGE_LIMIT),
        ),
      );
      const filtered = pools
        .flat()
        .filter((el) =>
          el.token_account_ids.every((token) => !blackList.includes(token)),
        );

      return filtered;
    } catch (e) {
      this.logger.warn(`Data request error from pools: ${e}`);
      return [];
    }
  }

  private async getPools(
    service,
    from: number,
    limit: number = DEFAULT_PAGE_LIMIT,
  ): Promise<ContractPool[]> {
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
}
