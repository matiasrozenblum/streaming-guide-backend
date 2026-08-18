import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSeenFeaturesToUsers1783100000000 implements MigrationInterface {
  name = 'AddSeenFeaturesToUsers1783100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "seen_features" text[] NOT NULL DEFAULT '{}'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "seen_features"`);
  }
}
