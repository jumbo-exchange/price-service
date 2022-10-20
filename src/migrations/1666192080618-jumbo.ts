import { MigrationInterface, QueryRunner } from 'typeorm';

export class jumbo1666192080618 implements MigrationInterface {
  name = 'jumbo1666192080618';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pool" ADD "volumeFirst" character varying NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "pool" ADD "volumeSecond" character varying NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "pool" DROP COLUMN "volumeSecond"`);
    await queryRunner.query(`ALTER TABLE "pool" DROP COLUMN "volumeFirst"`);
  }
}
