import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHourToUserStreamerRollup1784100000000
  implements MigrationInterface
{
  name = 'AddHourToUserStreamerRollup1784100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // The recap draws a grid of when someone watched, for streamers as well as
    // programs. The program side already has the hour in
    // analytics_daily_user_slot; streamers had no such dimension, so their grid
    // could not be built from anything but raw events — which are pruned at 90
    // days and would leave the yearly recap blind.
    //
    // The hour joins the primary key rather than sitting beside it: two plays of
    // the same streamer on the same day at different hours are different rows,
    // and the ranking simply sums over them.
    await queryRunner.query(`
      ALTER TABLE "analytics_daily_user_streamer"
      ADD COLUMN IF NOT EXISTS "hour" smallint
    `);

    // Existing rows predate the column and have no hour to recover. 0 would
    // claim they happened at midnight, so they are dropped instead: the rollup
    // recomputes the last few days on every run, and anything older is a
    // ranking that loses its time-of-day detail either way.
    await queryRunner.query(`
      DELETE FROM "analytics_daily_user_streamer" WHERE "hour" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "analytics_daily_user_streamer"
      ALTER COLUMN "hour" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "analytics_daily_user_streamer"
      DROP CONSTRAINT IF EXISTS "PK_analytics_daily_user_streamer"
    `);

    await queryRunner.query(`
      ALTER TABLE "analytics_daily_user_streamer"
      ADD CONSTRAINT "PK_analytics_daily_user_streamer"
      PRIMARY KEY ("date", "user_id", "streamer_id", "hour", "event_name")
    `);

    await queryRunner.query(`
      ALTER TABLE "analytics_daily_user_streamer"
      ADD CONSTRAINT "CHK_analytics_daily_user_streamer_hour"
      CHECK ("hour" >= 0 AND "hour" <= 23)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "analytics_daily_user_streamer"
      DROP CONSTRAINT IF EXISTS "CHK_analytics_daily_user_streamer_hour"
    `);
    await queryRunner.query(`
      ALTER TABLE "analytics_daily_user_streamer"
      DROP CONSTRAINT IF EXISTS "PK_analytics_daily_user_streamer"
    `);
    // Collapse back to one row per streamer per day before the old key can hold.
    await queryRunner.query(`
      DELETE FROM "analytics_daily_user_streamer" a
      USING "analytics_daily_user_streamer" b
      WHERE a.date = b.date AND a.user_id = b.user_id
        AND a.streamer_id = b.streamer_id AND a.event_name = b.event_name
        AND a.hour > b.hour
    `);
    await queryRunner.query(`
      ALTER TABLE "analytics_daily_user_streamer" DROP COLUMN IF EXISTS "hour"
    `);
    await queryRunner.query(`
      ALTER TABLE "analytics_daily_user_streamer"
      ADD CONSTRAINT "PK_analytics_daily_user_streamer"
      PRIMARY KEY ("date", "user_id", "streamer_id", "event_name")
    `);
  }
}
