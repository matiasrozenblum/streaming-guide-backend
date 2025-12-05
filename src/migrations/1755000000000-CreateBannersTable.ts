import { MigrationInterface, QueryRunner, Table, TableIndex } from "typeorm";

export class CreateBannersTable1755000000000 implements MigrationInterface {
    name = 'CreateBannersTable1755000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create banner table
        await queryRunner.createTable(
            new Table({
                name: 'banner',
                columns: [
                    {
                        name: 'id',
                        type: 'int',
                        isPrimary: true,
                        isGenerated: true,
                        generationStrategy: 'increment',
                    },
                    {
                        name: 'title',
                        type: 'varchar',
                        length: '255',
                    },
                    {
                        name: 'description',
                        type: 'text',
                        isNullable: true,
                    },
                    {
                        name: 'image_url',
                        type: 'text',
                    },
                    {
                        name: 'link_type',
                        type: 'enum',
                        enum: ['internal', 'external', 'none'],
                        default: "'none'",
                    },
                    {
                        name: 'link_url',
                        type: 'text',
                        isNullable: true,
                    },
                    {
                        name: 'is_enabled',
                        type: 'boolean',
                        default: true,
                    },
                    {
                        name: 'start_date',
                        type: 'timestamp',
                        isNullable: true,
                    },
                    {
                        name: 'end_date',
                        type: 'timestamp',
                        isNullable: true,
                    },
                    {
                        name: 'display_order',
                        type: 'int',
                        default: 0,
                    },
                    {
                        name: 'banner_type',
                        type: 'enum',
                        enum: ['news', 'promotional', 'featured'],
                        default: "'news'",
                    },
                    {
                        name: 'created_at',
                        type: 'timestamp',
                        default: 'CURRENT_TIMESTAMP',
                    },
                    {
                        name: 'updated_at',
                        type: 'timestamp',
                        default: 'CURRENT_TIMESTAMP',
                        onUpdate: 'CURRENT_TIMESTAMP',
                    },
                ],
            }),
            true
        );

        // Add indexes for performance
        await queryRunner.createIndex(
            'banner',
            new TableIndex({
                name: 'IDX_banner_is_enabled',
                columnNames: ['is_enabled'],
            })
        );

        await queryRunner.createIndex(
            'banner',
            new TableIndex({
                name: 'IDX_banner_display_order',
                columnNames: ['display_order'],
            })
        );

        await queryRunner.createIndex(
            'banner',
            new TableIndex({
                name: 'IDX_banner_dates',
                columnNames: ['start_date', 'end_date'],
            })
        );

        await queryRunner.createIndex(
            'banner',
            new TableIndex({
                name: 'IDX_banner_type',
                columnNames: ['banner_type'],
            })
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop indexes
        await queryRunner.dropIndex('banner', 'IDX_banner_is_enabled');
        await queryRunner.dropIndex('banner', 'IDX_banner_display_order');
        await queryRunner.dropIndex('banner', 'IDX_banner_dates');
        await queryRunner.dropIndex('banner', 'IDX_banner_type');
        
        // Drop banner table
        await queryRunner.dropTable('banner');
    }
}
