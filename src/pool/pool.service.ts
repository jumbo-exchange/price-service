import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { InMemoryCache } from 'apollo-cache-inmemory';
import ApolloClient from 'apollo-client';
import { HttpLink } from 'apollo-link-http';

import gql from 'graphql-tag';
import { Repository } from 'typeorm';
import fetch from 'cross-fetch';

import { Pool } from './pool.entity';
import Big from 'big.js';

export const createClient = (uri: string) =>
  new ApolloClient({
    link: new HttpLink({ uri, fetch: fetch }),
    cache: new InMemoryCache(),
  });

export const HOUR_IN_SECONDS = 60 * 60;
export const HOURS_IN_DAY = 24;

export const createQuery = (
  blockTimestamp_lte: string | number,
  blockTimestamp_gte: string | number,
) => gql`
  query Swaps {
    swaps(
      first: 1000,
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

  constructor(
    @InjectRepository(Pool)
    private readonly poolRepo: Repository<Pool>,
  ) {}

  @Cron('* * * * *')
  async handleCron() {
    this.logger.verbose('handleCron for pool service');

    try {
      const swaps = await this.requestDataForDay();
      swaps.map((array) =>
        this.logger.log(`Results length per hour ${array.length}`),
      );
      const flatSwaps = swaps.flat();
      const newPools: { [key: string]: Pool } = flatSwaps.reduce(
        (
          acc: { [key: string]: Pool },
          swap: {
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
          },
        ) => {
          const [, poolId] = swap.id?.split(' ');
          if (!poolId) return { ...acc };
          let poolFromAcc = acc[poolId];

          if (!poolFromAcc) {
            poolFromAcc = new Pool();
            poolFromAcc.id = poolId;
            poolFromAcc.tokenFirst = swap.tokenIn;
            poolFromAcc.tokenSecond = swap.tokenOut;
            poolFromAcc.volume24hFirst = new Big(swap.tokenInAmount).toFixed(0);
            poolFromAcc.volume24hSecond = new Big(swap.tokenOutAmount).toFixed(
              0,
            );
          } else {
            if (poolFromAcc.tokenFirst === swap.tokenIn) {
              poolFromAcc.volume24hFirst = new Big(poolFromAcc.volume24hFirst)
                .add(swap.tokenInAmount)
                .toFixed(0);
              poolFromAcc.volume24hSecond = new Big(poolFromAcc.volume24hSecond)
                .add(swap.tokenOutAmount)
                .toFixed(0);
            } else {
              poolFromAcc.volume24hFirst = new Big(poolFromAcc.volume24hFirst)
                .add(swap.tokenOutAmount)
                .toFixed(0);
              poolFromAcc.volume24hSecond = new Big(poolFromAcc.volume24hSecond)
                .add(swap.tokenInAmount)
                .toFixed(0);
            }
          }

          return { ...acc, [poolId]: poolFromAcc };
        },
        {},
      );

      await this.poolRepo.save(Object.values(newPools));
    } catch (e) {
      this.logger.error(`Cron job error: ${e}`);
    }
  }

  async requestDataForDay() {
    try {
      const client = createClient(process.env.GRAPH_API);
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
        const query = createQuery(resultsPerDay[i], resultsPerDay[i + 1]);

        const result = client.query({ query }).then((res) => res.data.swaps);
        requests.push(result);
      }

      return await Promise.all(requests).catch((e) => {
        this.logger.error(e);
        return [];
      });
    } catch (e) {
      this.logger.warn(`Data request error: ${e}`);
    }
  }

  async findAll(): Promise<Pool[]> {
    return this.poolRepo.find();
  }
}
