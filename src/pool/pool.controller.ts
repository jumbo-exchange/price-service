import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';

import { Pool } from './pool.entity';
import { PoolService } from './pool.service';

@Controller('pools')
export class PoolController {
  constructor(private readonly poolService: PoolService) {}

  @Get('/volumes')
  @ApiOperation({ summary: 'Get pool volumes 24h' })
  @ApiResponse({ status: 200, description: 'Get pool volumes array' })
  findAll(@Query() { take, skip }): Promise<Pool[]> {
    return this.poolService.getDailyPoolVolumes(take, skip);
  }

  @Get()
  @ApiOperation({ summary: 'Get pools' })
  @ApiResponse({ status: 200, description: 'Get pools for' })
  getPoolCoinMarketCap(@Query() { take, skip }): Promise<any> {
    return this.poolService.formatPools(take, skip);
  }
}
