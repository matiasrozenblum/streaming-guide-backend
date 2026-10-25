import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAnalyticsDailyUserStreamer1783900000000
  implements MigrationInterface
{
  name = 'CreateAnalyticsDailyUserStreamer1783900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // The per-user recap could rank programs and channels but not streamers:
    // analytics_daily_user keys on program_id, and a streamer has no program to
    // put in a key column. A parallel table keeps both keys non-null and
    // mirrors the split the program, channel and streamer rollups already have.
    //
    // The FK cascades for the same reason as analytics_daily_user: user_id is
    // part of the primary key, so closing an account has to remove these rows
    // rather than blank them, which is what the privacy policy promises.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "analytics_daily_user_streamer" (
        "date" date NOT NULL,
        "user_id" integer NOT NULL,
        "streamer_id" integer NOT NULL,
        "event_name" character varying(64) NOT NULL,
        "count" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_analytics_daily_user_streamer"
          PRIMARY KEY ("date", "user_id", "streamer_id", "event_name")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_analytics_daily_user_streamer_user_date"
      ON "analytics_daily_user_streamer" ("user_id", "date")
    `);

    await queryRunner.query(`
      ALTER TABLE "analytics_daily_user_streamer"
      ADD CONSTRAINT "FK_analytics_daily_user_streamer_user"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "analytics_daily_user_streamer"
      DROP CONSTRAINT IF EXISTS "FK_analytics_daily_user_streamer_user"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_analytics_daily_user_streamer_user_date"
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "analytics_daily_user_streamer"
    `);
  }
}
