import { MigrationInterface, QueryRunner } from 'typeorm';

export class CascadeAnalyticsDailyUserOnDelete1783800000000
  implements MigrationInterface
{
  name = 'CascadeAnalyticsDailyUserOnDelete1783800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // analytics_daily_user was created without a foreign key, so closing an
    // account left its rows behind with the user_id intact — while the privacy
    // policy promises the history is dissociated irreversibly.
    //
    // CASCADE rather than SET NULL: user_id is part of the primary key and a
    // key column cannot be nulled. Deleting is also lossless for reporting,
    // because this table only ever feeds the per-user recap — the program,
    // channel and totals rollups are computed separately and are untouched.

    // Any row whose user is already gone predates the constraint and would
    // block it from being added.
    await queryRunner.query(`
      DELETE FROM "analytics_daily_user" d
      WHERE NOT EXISTS (SELECT 1 FROM "users" u WHERE u.id = d.user_id)
    `);

    await queryRunner.query(`
      ALTER TABLE "analytics_daily_user"
      ADD CONSTRAINT "FK_analytics_daily_user_user"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "analytics_daily_user"
      DROP CONSTRAINT IF EXISTS "FK_analytics_daily_user_user"
    `);
  }
}
