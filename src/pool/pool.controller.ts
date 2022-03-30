import { Controller, Get } from '@nestjs/common';

import { Pool } from './pool.entity';
import { PoolService } from './pool.service';

@Controller('pool-volumes')
export class PoolController {
  constructor(private readonly poolService: PoolService) {}

  @Get()
  findAll(): Promise<Pool[]> {
    return this.poolService.findAll();
  }
}
