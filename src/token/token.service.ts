import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { Repository } from 'typeorm';

import { Token } from './token.entity';
import { configService } from '../../src/config.service';

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    @InjectRepository(Token)
    private readonly tokenRepo: Repository<Token>,
  ) {}

  @Cron('* * * * *')
  async handleCron() {
    this.logger.verbose('handleCron');

    try {
      const tokenPrices = await this.requestData();
      const filteredTokens = Object.entries(tokenPrices);

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
      this.logger.warn(`Data request error: ${e}`);
    }
  }

  async findAll(): Promise<Token[]> {
    return this.tokenRepo.find();
  }
}
