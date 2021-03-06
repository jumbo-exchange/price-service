import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';

import { Pool } from './pool.entity';
import { PoolService } from './pool.service';

@Controller('pool-volumes')
export class PoolController {
  constructor(private readonly poolService: PoolService) {}

  @Get()
  @ApiOperation({ summary: 'Get pool volumes' })
  @ApiResponse({ status: 200, description: 'Get pool volumes array' })
  findAll(@Query() { take, skip }): Promise<Pool[]> {
    return this.poolService.findAll(take, skip);
  }
}
