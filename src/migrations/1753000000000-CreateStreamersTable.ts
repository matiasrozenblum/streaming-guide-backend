import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from "typeorm";

export class CreateStreamersTable1753000000000 implements MigrationInterface {
    name = 'CreateStreamersTable1753000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create streamer table
        await queryRunner.createTable(
            new Table({
                name: 'streamer',
                columns: [
                    {
                        name: 'id',
                        type: 'int',
                        isPrimary: true,
                        isGenerated: true,
                        generationStrategy: 'increment',
                    },
                    {
                        name: 'name',
                        type: 'varchar',
                        isUnique: true,
                    },
                    {
                        name: 'logo_url',
                        type: 'text',
                        isNullable: true,
                    },
                    {
                        name: 'is_visible',
                        type: 'boolean',
                        default: true,
                    },
                    {
                        name: 'services',
                        type: 'json',
                        isNullable: false,
                        default: "'[]'",
                    },
                ],
            }),
            true
        );

        // Create streamer_categories_category junction table
        await queryRunner.createTable(
            new Table({
                name: 'streamer_categories_category',
                columns: [
                    {
                        name: 'streamerId',
                        type: 'int',
                        isPrimary: true,
                    },
                    {
                        name: 'categoryId',
                        type: 'int',
                        isPrimary: true,
                    },
                ],
            }),
            true
        );

        // Add foreign key constraints
        await queryRunner.createForeignKey(
            'streamer_categories_category',
            new TableForeignKey({
                columnNames: ['streamerId'],
                referencedColumnNames: ['id'],
                referencedTableName: 'streamer',
                onDelete: 'CASCADE',
            })
        );

        await queryRunner.createForeignKey(
            'streamer_categories_category',
            new TableForeignKey({
                columnNames: ['categoryId'],
                referencedColumnNames: ['id'],
                referencedTableName: 'category',
                onDelete: 'CASCADE',
            })
        );

        // Add index for is_visible for performance
        await queryRunner.createIndex(
            'streamer',
            new TableIndex({
                name: 'IDX_streamer_is_visible',
                columnNames: ['is_visible'],
            })
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop index
        await queryRunner.dropIndex('streamer', 'IDX_streamer_is_visible');

        // Drop foreign key constraints
        const table = await queryRunner.getTable('streamer_categories_category');
        if (table) {
            const foreignKeys = table.foreignKeys;
            for (const foreignKey of foreignKeys) {
                await queryRunner.dropForeignKey('streamer_categories_category', foreignKey);
            }
        }

        // Drop junction table
        await queryRunner.dropTable('streamer_categories_category');
        
        // Drop streamer table
        await queryRunner.dropTable('streamer');
    }
}

