import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIsVisibleToProgram1767130360000 implements MigrationInterface {
  name = 'AddIsVisibleToProgram1767130360000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "program"
      ADD COLUMN IF NOT EXISTS "is_visible" boolean NOT NULL DEFAULT true
    `);
    await queryRunner.query(`
      UPDATE "program"
      SET "is_visible" = true
      WHERE "is_visible" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "program"
      DROP COLUMN IF EXISTS "is_visible"
    `);
  }
}


