import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import 'dotenv/config';

class ConfigService {
  constructor(private env: { [k: string]: string | undefined }) {}

  private getValue(key: string, throwOnMissing = true): string {
    const value = this.env[key];
    if (!value && throwOnMissing) {
      throw new Error(`config error - missing env.${key}`);
    }

    return value;
  }

  public ensureValues(keys: string[]) {
    keys.forEach((k) => this.getValue(k, true));
    return this;
  }

  public getPort() {
    return this.getValue('PORT', true);
  }

  public isProduction() {
    const mode = this.getValue('MODE', false);
    return mode != 'DEV';
  }

  public getApolloUrl(): string {
    return this.getValue('GRAPH_API');
  }

  public getPriceServiceUrl(): string {
    return this.getValue('PRICE_API');
  }

  public getContractUrl(): string {
    return this.getValue('CONTRACT_URL');
  }

  public getHelperUrl(): string {
    return this.getValue('HELPER_URL');
  }

  public getNodeUrl(): string {
    return this.getValue('NODE_URL');
  }

  public getNetworkId(): string {
    return this.getValue('NETWORK_ID');
  }

  public getJumboPoolId(): string {
    return this.getValue('JUMBO_POOL_ID');
  }

  public getJumboTokenId(): string {
    return this.getValue('JUMBO_TOKEN_ADDRESS');
  }

  public getNearTokenId(): string {
    return this.getValue('WRAP_NEAR_ADDRESS');
  }

  public getBlackList(): string[] {
    return this.getValue('BLACK_LIST').split(' ');
  }

  public getTypeOrmConfig(): TypeOrmModuleOptions {
    return {
      type: 'postgres',

      host: this.getValue('POSTGRES_HOST'),
      port: parseInt(this.getValue('POSTGRES_PORT')),
      username: this.getValue('POSTGRES_USER'),
      password: this.getValue('POSTGRES_PASSWORD'),
      database: this.getValue('POSTGRES_DATABASE'),

      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      synchronize: true,
      ssl: this.env.POSTGRES_SSL ? !!this.getValue('POSTGRES_SSL') : false,
    };
  }
}

const configService = new ConfigService(process.env).ensureValues([
  'POSTGRES_HOST',
  'POSTGRES_PORT',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'POSTGRES_DATABASE',
]);

export { configService };
