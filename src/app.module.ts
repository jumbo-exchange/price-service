import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { configService } from './config.service';
import { ScheduleModule } from '@nestjs/schedule';
import { TokenModule } from './token/token.module';
import { PoolModule } from './pool/pool.module';

@Module({
  imports: [
    TypeOrmModule.forRoot(configService.getTypeOrmConfig()),
    ScheduleModule.forRoot(),
    TokenModule,
    PoolModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
