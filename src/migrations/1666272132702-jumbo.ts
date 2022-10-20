import { MigrationInterface, QueryRunner } from 'typeorm';

export class jumbo1666272132702 implements MigrationInterface {
  name = 'jumbo1666272132702';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pool" ALTER COLUMN "volumeFirst" SET DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "pool" ALTER COLUMN "volumeSecond" SET DEFAULT '0'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pool" ALTER COLUMN "volumeSecond" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "pool" ALTER COLUMN "volumeFirst" DROP DEFAULT`,
    );
  }
}
