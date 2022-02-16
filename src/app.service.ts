import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getPrices(): string {
    return 'Hello World!';
  }
}
