import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { Repository } from 'typeorm';
import { Token } from './token.entity';

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  constructor(
    @InjectRepository(Token)
    private readonly tokenRepo: Repository<Token>,
  ) {}

  @Cron('* * * * *')
  async handleCron() {
    try {
      const tokenPrices = await this.requestData();
      const filteredTokens = Object.entries(tokenPrices);

      const newTokens: Token[] = filteredTokens.map(
        ([key, value]: [
          key: string,
          value: { decimal: number; symbol: string; price: string },
        ]) => {
          const token = new Token();
          token.id = key;
          token.decimal = value.decimal;
          token.symbol = value.symbol;
          token.price = value.price;
          return token;
        },
      );
      console.log(newTokens);
      await this.tokenRepo.save(newTokens);
    } catch (e) {
      console.log(e);
    }
  }
  async requestData() {
    try {
      const tokenResults = await axios.get(
        process.env.API + process.env.API_PATH,
      );
      return tokenResults.data;
    } catch (e) {
      console.warn(e);
    }
  }

  async findAll(): Promise<Token[]> {
    return this.tokenRepo.find();
  }
}
