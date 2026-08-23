import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMonthlyScheduleFields1779630918547 implements MigrationInterface {
  name = 'AddMonthlyScheduleFields1779630918547';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "schedule" ADD "schedule_type" character varying NOT NULL DEFAULT 'weekly'`,
    );
    await queryRunner.query(
      `ALTER TABLE "schedule" ADD "week_number_in_month" integer`,
    );
    await queryRunner.query(`ALTER TABLE "schedule" ADD "specific_date" date`);
    await queryRunner.query(
      `ALTER TABLE "schedule" ALTER COLUMN "day_of_week" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "schedule" ALTER COLUMN "day_of_week" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "schedule" DROP COLUMN "specific_date"`,
    );
    await queryRunner.query(
      `ALTER TABLE "schedule" DROP COLUMN "week_number_in_month"`,
    );
    await queryRunner.query(
      `ALTER TABLE "schedule" DROP COLUMN "schedule_type"`,
    );
  }
}
