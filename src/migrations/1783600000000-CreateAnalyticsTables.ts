import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAnalyticsTables1783600000000 implements MigrationInterface {
  name = 'CreateAnalyticsTables1783600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Raw event store. Short-lived (see the retention job); the permanent
    // history lives in the analytics_daily_* rollups below.
    await queryRunner.query(`
      CREATE TABLE "analytics_event" (
        "id" BIGSERIAL NOT NULL,
        "event_name" character varying(64) NOT NULL,
        "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "received_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "platform" character varying(16) NOT NULL,
        "app_version" character varying(32),
        "user_id" integer,
        "device_id" character varying(64),
        "session_id" character varying(64),
        "program_id" integer,
        "channel_id" integer,
        "user_gender" character varying(24),
        "user_age_group" character varying(16),
        "properties" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_analytics_event" PRIMARY KEY ("id")
      )
    `);

    // SET NULL rather than CASCADE: deleting a program must not erase the
    // history of it having been watched. The rollups keep the aggregate anyway.
    await queryRunner.query(`
      ALTER TABLE "analytics_event"
      ADD CONSTRAINT "FK_analytics_event_user"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "analytics_event"
      ADD CONSTRAINT "FK_analytics_event_program"
      FOREIGN KEY ("program_id") REFERENCES "program"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "analytics_event"
      ADD CONSTRAINT "FK_analytics_event_channel"
      FOREIGN KEY ("channel_id") REFERENCES "channel"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_analytics_event_occurred_at" ON "analytics_event" ("occurred_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_analytics_event_name_occurred" ON "analytics_event" ("event_name", "occurred_at")`,
    );
    // Partial indexes: the vast majority of rows carry no program/channel/user,
    // and keeping those out of the index makes the ranking scans much cheaper.
    await queryRunner.query(
      `CREATE INDEX "IDX_analytics_event_program_occurred" ON "analytics_event" ("program_id", "occurred_at") WHERE "program_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_analytics_event_channel_occurred" ON "analytics_event" ("channel_id", "occurred_at") WHERE "channel_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_analytics_event_user_occurred" ON "analytics_event" ("user_id", "occurred_at") WHERE "user_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_analytics_event_device_occurred" ON "analytics_event" ("device_id", "occurred_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE "analytics_daily_program" (
        "date" date NOT NULL,
        "program_id" integer NOT NULL,
        "event_name" character varying(64) NOT NULL,
        "channel_id" integer,
        "count" integer NOT NULL DEFAULT 0,
        "unique_users" integer NOT NULL DEFAULT 0,
        "unique_devices" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_analytics_daily_program" PRIMARY KEY ("date", "program_id", "event_name")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_analytics_daily_program_event_date" ON "analytics_daily_program" ("event_name", "date")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_analytics_daily_program_ranking" ON "analytics_daily_program" ("date", "event_name", "count")`,
    );

    await queryRunner.query(`
      CREATE TABLE "analytics_daily_channel" (
        "date" date NOT NULL,
        "channel_id" integer NOT NULL,
        "event_name" character varying(64) NOT NULL,
        "count" integer NOT NULL DEFAULT 0,
        "unique_users" integer NOT NULL DEFAULT 0,
        "unique_devices" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_analytics_daily_channel" PRIMARY KEY ("date", "channel_id", "event_name")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_analytics_daily_channel_event_date" ON "analytics_daily_channel" ("event_name", "date")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_analytics_daily_channel_ranking" ON "analytics_daily_channel" ("date", "event_name", "count")`,
    );

    await queryRunner.query(`
      CREATE TABLE "analytics_daily_user" (
        "date" date NOT NULL,
        "user_id" integer NOT NULL,
        "program_id" integer NOT NULL,
        "event_name" character varying(64) NOT NULL,
        "channel_id" integer,
        "count" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_analytics_daily_user" PRIMARY KEY ("date", "user_id", "program_id", "event_name")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_analytics_daily_user_user_date" ON "analytics_daily_user" ("user_id", "date")`,
    );

    await queryRunner.query(`
      CREATE TABLE "analytics_daily_totals" (
        "date" date NOT NULL,
        "platform" character varying(16) NOT NULL,
        "event_name" character varying(64) NOT NULL,
        "count" integer NOT NULL DEFAULT 0,
        "unique_users" integer NOT NULL DEFAULT 0,
        "unique_devices" integer NOT NULL DEFAULT 0,
        "sessions" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_analytics_daily_totals" PRIMARY KEY ("date", "platform", "event_name")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_analytics_daily_totals_event_date" ON "analytics_daily_totals" ("event_name", "date")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "analytics_daily_totals"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "analytics_daily_user"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "analytics_daily_channel"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "analytics_daily_program"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "analytics_event"`);
  }
}
