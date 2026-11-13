import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRecapPushPreferences1784200000000
  implements MigrationInterface
{
  name = 'AddRecapPushPreferences1784200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // The recap is announced by a push when it is first published — Friday at
    // 18:00 for the week, the second-to-last evening of the month for the
    // month. These two say whether we may send it.
    //
    // Default true, and existing rows get it: somebody who signed up before
    // this existed did so to get the recap, and asking everyone to opt in to
    // the announcement of the feature they signed up for would mean nobody
    // hears about it. Turning it off lives in their profile.
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "recap_weekly_push" boolean NOT NULL DEFAULT true
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "recap_monthly_push" boolean NOT NULL DEFAULT true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "recap_monthly_push"
    `);
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "recap_weekly_push"
    `);
  }
}
