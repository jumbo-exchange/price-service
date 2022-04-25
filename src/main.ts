import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configService } from './config.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });

  if (!configService.isProduction()) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('🐘 Api')
        .setDescription('Jumbo Exchange token price service')
        .build(),
    );

    SwaggerModule.setup('docs', app, document);
  }
  const port = process.env.PORT ?? 3000;
  const host = process.env.HOST || '0.0.0.0';
  await app.listen(port, host);
}
bootstrap();
