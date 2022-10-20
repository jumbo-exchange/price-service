import { MigrationInterface, QueryRunner } from 'typeorm';

export class jumbo1666272817124 implements MigrationInterface {
  name = 'jumbo1666272817124';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pool" ADD "volumeFirst" character varying NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "pool" ADD "volumeSecond" character varying NOT NULL DEFAULT '0'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "pool" DROP COLUMN "volumeSecond"`);
    await queryRunner.query(`ALTER TABLE "pool" DROP COLUMN "volumeFirst"`);
  }
}
