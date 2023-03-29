import { MigrationInterface, QueryRunner } from 'typeorm';

export class jumbo1625947177733 implements MigrationInterface {
  name = 'jumbo1625947177733';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "pool" ("id" character varying NOT NULL, "volume24hFirst" character varying NOT NULL, "volume24hSecond" character varying NOT NULL, "tokenFirst" character varying NOT NULL, "tokenSecond" character varying NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "volumeFirst" character varying NOT NULL DEFAULT '0', "volumeSecond" character varying NOT NULL DEFAULT '0', CONSTRAINT "PK_db1bfe411e1516c01120b85f8fe" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "token" ("id" character varying NOT NULL, "decimal" integer NOT NULL, "symbol" character varying NOT NULL, "price" character varying NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_82fae97f905930df5d62a702fc9" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "token"`);
    await queryRunner.query(`DROP TABLE "pool"`);
  }
}
