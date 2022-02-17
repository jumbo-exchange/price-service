import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import axios from 'axios';
import { getRepository } from 'typeorm';
import { Token } from './token.entity';

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  @Cron('* * * * * *')
  async handleCron() {
    try {
      const tokenPrices = await requestData();
      const filteredTokens = validateTokens(tokenPrices);
      const tokenRepository = getRepository(Token);
      const newTokens: Token[] = filteredTokens.map(
        ([key, value]: [
          key: string,
          value: { decimals: number; symbol: string; price: string },
        ]) => {
          const token = new Token();
          token.id = key;
          token.decimals = value.decimals;
          token.symbol = value.symbol;
          token.price = value.price;
          return token;
        },
      );
      await tokenRepository.save(newTokens);
    } catch (e) {
      console.log(e);
    }
  }
}

const requestData = async () => {
  try {
    const tokenResults = await axios.get(
      process.env.API + process.env.API_PATH,
    );
    return tokenResults.data;
  } catch (e) {
    console.warn(e);
  }
};

const validateTokens = (tokens) => {
  return Object.entries(tokens);
};
