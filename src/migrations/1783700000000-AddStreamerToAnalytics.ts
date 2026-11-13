import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStreamerToAnalytics1783700000000 implements MigrationInterface {
  name = 'AddStreamerToAnalytics1783700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Streamer events (streamer_service_click, streamer_subscribe) already carry
    // streamer_id in their properties; promoting it to a column lets the ranking
    // aggregate on an indexed int instead of a jsonb lookup, same as programs.
    await queryRunner.query(
      `ALTER TABLE "analytics_event" ADD "streamer_id" integer`,
    );
    await queryRunner.query(`
      ALTER TABLE "analytics_event"
      ADD CONSTRAINT "FK_analytics_event_streamer"
      FOREIGN KEY ("streamer_id") REFERENCES "streamer"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_analytics_event_streamer_occurred" ON "analytics_event" ("streamer_id", "occurred_at") WHERE "streamer_id" IS NOT NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE "analytics_daily_streamer" (
        "date" date NOT NULL,
        "streamer_id" integer NOT NULL,
        "event_name" character varying(64) NOT NULL,
        "count" integer NOT NULL DEFAULT 0,
        "unique_users" integer NOT NULL DEFAULT 0,
        "unique_devices" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_analytics_daily_streamer" PRIMARY KEY ("date", "streamer_id", "event_name")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_analytics_daily_streamer_event_date" ON "analytics_daily_streamer" ("event_name", "date")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_analytics_daily_streamer_ranking" ON "analytics_daily_streamer" ("date", "event_name", "count")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "analytics_daily_streamer"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_analytics_event_streamer_occurred"`,
    );
    await queryRunner.query(
      `ALTER TABLE "analytics_event" DROP CONSTRAINT IF EXISTS "FK_analytics_event_streamer"`,
    );
    await queryRunner.query(
      `ALTER TABLE "analytics_event" DROP COLUMN IF EXISTS "streamer_id"`,
    );
  }
}
