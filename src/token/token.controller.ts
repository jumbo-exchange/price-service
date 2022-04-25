import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';

import { Token } from './token.entity';
import { TokenService } from './token.service';

@Controller('token-prices')
export class TokenController {
  constructor(private readonly tokenService: TokenService) {}

  @Get()
  @ApiOperation({ summary: 'Get token price' })
  @ApiResponse({ status: 200, description: 'Token prices array' })
  findAll(): Promise<Token[]> {
    return this.tokenService.findAll();
  }
}
