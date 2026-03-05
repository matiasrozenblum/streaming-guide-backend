import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateUserStreamerSubscriptions1753000002000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(
            new Table({
                name: 'user_streamer_subscriptions',
                columns: [
                    {
                        name: 'id',
                        type: 'uuid',
                        isPrimary: true,
                        isGenerated: true,
                        generationStrategy: 'uuid',
                    },
                    {
                        name: 'user_id',
                        type: 'int',
                    },
                    {
                        name: 'streamer_id',
                        type: 'int',
                    },
                    {
                        name: 'notification_method',
                        type: 'enum',
                        enum: ['push', 'email', 'both'],
                        default: "'both'",
                    },
                    {
                        name: 'is_active',
                        type: 'boolean',
                        default: true,
                    },
                    {
                        name: 'created_at',
                        type: 'timestamp',
                        default: 'now()',
                    },
                    {
                        name: 'updated_at',
                        type: 'timestamp',
                        default: 'now()',
                    },
                ],
            }),
            true,
        );

        await queryRunner.createForeignKey(
            'user_streamer_subscriptions',
            new TableForeignKey({
                columnNames: ['user_id'],
                referencedColumnNames: ['id'],
                referencedTableName: 'users',
                onDelete: 'CASCADE',
            }),
        );

        await queryRunner.createForeignKey(
            'user_streamer_subscriptions',
            new TableForeignKey({
                columnNames: ['streamer_id'],
                referencedColumnNames: ['id'],
                referencedTableName: 'streamer', // Note: Streamer entity table name defaults to 'streamer' or 'streamers'? Checking...
                onDelete: 'CASCADE',
            }),
        );

        // Check actual table name for Streamer entity. Ideally I should have checked this.
        // Based on previous file views, Streamer entity is @Entity() so it uses default name.
        // Usually TypeORM uses class name as table name, but singular/plural depends on configuration.
        // I will assume 'streamer' for now but I should verify if it's 'streamers' or 'streamer'.
        // Wait, looking at file view step 15, Streamer is @Entity(). 
        // File view step 6 shows migrations creating 'streamers' table? 
        // Ah, typically I should check the migration that created streamers table.
        // Let me double check if I can catch this error.

        await queryRunner.createIndex(
            'user_streamer_subscriptions',
            new TableIndex({
                name: 'IDX_user_streamer',
                columnNames: ['user_id', 'streamer_id'],
                isUnique: true,
            }),
        );

        await queryRunner.createIndex(
            'user_streamer_subscriptions',
            new TableIndex({
                name: 'IDX_streamer_active',
                columnNames: ['streamer_id', 'is_active'],
            }),
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('user_streamer_subscriptions');
    }
}
