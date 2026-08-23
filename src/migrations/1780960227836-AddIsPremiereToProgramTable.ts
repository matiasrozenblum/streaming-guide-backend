import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIsPremiereToProgramTable1780960227836 implements MigrationInterface {
  name = 'AddIsPremiereToProgramTable1780960227836';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "program" ADD "is_premiere" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "program" DROP COLUMN "is_premiere"`);
  }
}
