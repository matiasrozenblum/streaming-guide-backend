import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAnalyticsDailyUserSlot1784000000000
  implements MigrationInterface
{
  name = 'CreateAnalyticsDailyUserSlot1784000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // The recap can say what someone watched but not when. Hour of day only
    // exists on analytics_event, which is pruned at 90 days, so a yearly recap
    // could never show it. This rollup keeps the time-of-day dimension for the
    // whole retained history.
    //
    // The hour is stored raw (0-23, Argentina time) instead of pre-bucketed:
    // grouping into bands happens at read time, so changing the bands later is
    // a different GROUP BY rather than a migration.
    //
    // channel_id and program_id are both in the key so the same rows answer
    // "which channels at which hours" and "which programs in that slot".
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "analytics_daily_user_slot" (
        "date" date NOT NULL,
        "user_id" integer NOT NULL,
        "channel_id" integer NOT NULL,
        "program_id" integer NOT NULL,
        "hour" smallint NOT NULL,
        "event_name" character varying(64) NOT NULL,
        "count" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_analytics_daily_user_slot" PRIMARY KEY
          ("date", "user_id", "channel_id", "program_id", "hour", "event_name"),
        CONSTRAINT "CHK_analytics_daily_user_slot_hour"
          CHECK ("hour" >= 0 AND "hour" <= 23)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_analytics_daily_user_slot_user_date"
      ON "analytics_daily_user_slot" ("user_id", "date")
    `);

    // Same cascade as the other per-user rollups: user_id is part of the key,
    // so closing an account has to remove these rows rather than blank them.
    await queryRunner.query(`
      ALTER TABLE "analytics_daily_user_slot"
      ADD CONSTRAINT "FK_analytics_daily_user_slot_user"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "analytics_daily_user_slot"
      DROP CONSTRAINT IF EXISTS "FK_analytics_daily_user_slot_user"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_analytics_daily_user_slot_user_date"
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "analytics_daily_user_slot"
    `);
  }
}
