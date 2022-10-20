import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TokenModule } from 'src/token/token.module';
import { PoolController } from './pool.controller';
import { Pool } from './pool.entity';
import { PoolService } from './pool.service';

@Module({
  imports: [TypeOrmModule.forFeature([Pool]), forwardRef(() => TokenModule)],
  providers: [PoolService],
  controllers: [PoolController],
  exports: [PoolService],
})
export class PoolModule {}
