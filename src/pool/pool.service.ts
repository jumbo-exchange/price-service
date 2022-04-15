import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
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

const HOUR_IN_SECONDS = 60 * 60;
const HOURS_IN_DAY = 24;
const SECONDS_IN_HOUR = 60 * 60 * 1000;

export const createClient = (uri: string) =>
  new ApolloClient({
    link: new HttpLink({ uri, fetch: fetch }),
    cache: new InMemoryCache(),
  });

interface Swap {
  id: string;
  output: string;
  poolId: number;
  blockTimestamp: number;
  tokenInAmount: number;
  tokenIn: string;
  tokenOutAmount: number;
  tokenOut: string;
  receiptId: string;
  predecessorId: string;
}

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

  constructor(
    @InjectRepository(Pool)
    private readonly poolRepo: Repository<Pool>,
  ) {}

  @Cron('* */4 * * *')
  async handleCron() {
    this.logger.verbose('handleCron for pool service');

    try {
      const swaps = await this.requestDataForDay();
      swaps.map((array) =>
        this.logger.log(`Results length per hour ${array.length}`),
      );
      const flatSwaps = swaps.flat();
      const newPools: { [key: string]: Pool } = flatSwaps.reduce(
        (acc: { [key: string]: Pool }, swap: Swap) => {
          try {
            const [, poolId] = swap.id?.split(' ');
            if (!poolId) return { ...acc };
            let poolFromAcc = acc[poolId];

            if (!poolFromAcc) {
              poolFromAcc = new Pool();
              poolFromAcc.id = poolId;
              poolFromAcc.tokenFirst = swap.tokenIn;
              poolFromAcc.tokenSecond = swap.tokenOut;
              poolFromAcc.volume24hFirst = '0';
              poolFromAcc.volume24hSecond = '0';
            }

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
        {},
      );

      await this.poolRepo.save(Object.values(newPools));
    } catch (e) {
      this.logger.error(`Cron job error: ${e}`);
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

  async findAll(take = 1000, skip = 0): Promise<Pool[]> {
    const [data] = await this.poolRepo.findAndCount({ take, skip });
    const currentDate = Date.now();
    return data.filter((pool) => {
      const poolDate = new Date(pool.updatedAt).getTime();
      return currentDate - poolDate < SECONDS_IN_HOUR * HOURS_IN_DAY;
    });
  }
}
