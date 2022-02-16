import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configService } from './config.service';

import * as cron from 'node-cron';
import axios from 'axios';
import { Token } from './model/token.entity';
import { getRepository, getConnection } from 'typeorm';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  if (!configService.isProduction()) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Item API')
        .setDescription('My Item API')
        .build(),
    );

    SwaggerModule.setup('docs', app, document);
  }
  cron.schedule('* * * * *', async function () {
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
      console.log('12', newTokens);

      await Promise.all(newTokens.map((token) => tokenRepository.save(token)));
    } catch (e) {
      console.log(e);
    }
  });
  await app.listen(3000);
}
bootstrap();

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
