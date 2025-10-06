import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPerformanceIndexes1734567890000 implements MigrationInterface {
    name = 'AddPerformanceIndexes1734567890000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Composite index for day + time queries (most common query pattern)
        await queryRunner.query(`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_schedule_day_time_visible" 
            ON "schedule" ("day_of_week", "start_time") 
            WHERE "day_of_week" IS NOT NULL
        `);

        // Index for program-channel joins with live status
        await queryRunner.query(`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_program_channel_live" 
            ON "program" ("channel_id", "is_live") 
            WHERE "channel_id" IS NOT NULL
        `);

        // Index for visible channels ordering
        await queryRunner.query(`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_channel_visible_order" 
            ON "channel" ("is_visible", "order") 
            WHERE "is_visible" = true
        `);

        // Index for user subscriptions (for device-based filtering)
        await queryRunner.query(`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_user_subscription_active" 
            ON "user_subscription" ("user_id", "is_active") 
            WHERE "is_active" = true
        `);

        // Index for device lookups
        await queryRunner.query(`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_device_device_id" 
            ON "device" ("device_id")
        `);

        // Index for panelist-program joins
        await queryRunner.query(`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_program_panelist_program_id" 
            ON "program_panelist" ("program_id")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "idx_schedule_day_time_visible"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "idx_program_channel_live"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "idx_channel_visible_order"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "idx_user_subscription_active"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "idx_device_device_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "idx_program_panelist_program_id"`);
    }
}
