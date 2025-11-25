import { MigrationInterface, QueryRunner } from "typeorm";

export class BackfillChannelYouTubeConfigs1754000000000 implements MigrationInterface {
    name = 'BackfillChannelYouTubeConfigs1754000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Get the global youtube.fetch_enabled value (default to 'true' if not set)
        const globalFetchEnabledResult = await queryRunner.query(`
            SELECT value FROM config WHERE key = 'youtube.fetch_enabled' LIMIT 1
        `);
        const globalFetchEnabled = globalFetchEnabledResult[0]?.value || 'true';

        // Get all channels that have a handle
        const channels = await queryRunner.query(`
            SELECT id, handle FROM channel WHERE handle IS NOT NULL AND handle != ''
        `);

        // For each channel, create the two configs if they don't exist
        for (const channel of channels) {
            const handle = channel.handle;
            const fetchEnabledKey = `youtube.fetch_enabled.${handle}`;
            const holidayOverrideKey = `youtube.fetch_override_holiday.${handle}`;

            // Check if fetch_enabled config exists
            const fetchEnabledExists = await queryRunner.query(`
                SELECT id FROM config WHERE key = $1 LIMIT 1
            `, [fetchEnabledKey]);

            // Create fetch_enabled config if it doesn't exist
            if (fetchEnabledExists.length === 0) {
                await queryRunner.query(`
                    INSERT INTO config (key, value, created_at, updated_at)
                    VALUES ($1, $2, NOW(), NOW())
                `, [fetchEnabledKey, globalFetchEnabled]);
            }

            // Check if holiday override config exists
            const holidayOverrideExists = await queryRunner.query(`
                SELECT id FROM config WHERE key = $1 LIMIT 1
            `, [holidayOverrideKey]);

            // Create holiday override config if it doesn't exist (default to 'true')
            if (holidayOverrideExists.length === 0) {
                await queryRunner.query(`
                    INSERT INTO config (key, value, created_at, updated_at)
                    VALUES ($1, $2, NOW(), NOW())
                `, [holidayOverrideKey, 'true']);
            }
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // This migration only creates missing configs, so the down migration
        // would need to know which configs were created by this migration.
        // Since we can't easily track that, we'll leave the configs in place.
        // If you need to rollback, you can manually delete the configs that
        // were created by this migration.
        // 
        // Note: We're not deleting configs in the down migration because:
        // 1. We can't distinguish between configs created by this migration vs manually created ones
        // 2. The configs are useful and should remain even if we rollback the migration
    }
}

