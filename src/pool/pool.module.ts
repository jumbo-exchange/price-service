import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PoolController } from './pool.controller';
import { Pool } from './pool.entity';
import { PoolService } from './pool.service';

@Module({
  imports: [TypeOrmModule.forFeature([Pool])],
  providers: [PoolService],
  controllers: [PoolController],
})
export class PoolModule {}
