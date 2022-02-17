import { Controller, Get } from '@nestjs/common';

import { Token } from './token.entity';
import { TokenService } from './token.service';

@Controller('token-prices')
export class TokenController {
  constructor(private readonly tokenService: TokenService) {}

  @Get()
  findAll(): Promise<Token[]> {
    return this.tokenService.findAll();
  }
}
