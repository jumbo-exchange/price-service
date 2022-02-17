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
      console.log(tokenPrices);
      const tokenRepository = await getRepository(Token);
      const newTokens = filteredTokens.map((el) => {
        const token = new Token();
        token.decimals = el.decimals;
        token.symbol = el.symbol;
        token.price = el.price;
      });

      await Promise.all(newTokens.map((token) => tokenRepository.save(token)));
    } catch (e) {
      console.log(e);
    }
  }
}

const requestData = async () => {
  try {
    console.log(process.env.API + process.env.API_PATH);
    const tokenResults = await axios.get(
      process.env.API + process.env.API_PATH,
    );
    return tokenResults.data;
  } catch (e) {
    console.warn(e);
  }
};

const validateTokens = (tokens) => {
  return tokens;
};
