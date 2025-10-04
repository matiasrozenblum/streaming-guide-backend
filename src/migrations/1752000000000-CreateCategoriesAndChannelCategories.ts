import { MigrationInterface, QueryRunner, Table, TableForeignKey } from "typeorm";

export class CreateCategoriesAndChannelCategories1752000000000 implements MigrationInterface {
    name = 'CreateCategoriesAndChannelCategories1752000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create categories table
        await queryRunner.createTable(
            new Table({
                name: 'category',
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
                        name: 'description',
                        type: 'text',
                        isNullable: true,
                    },
                    {
                        name: 'color',
                        type: 'varchar',
                        isNullable: true,
                    },
                    {
                        name: 'order',
                        type: 'int',
                        default: 0,
                    },
                ],
            }),
            true
        );

        // Create channel_categories_category junction table
        await queryRunner.createTable(
            new Table({
                name: 'channel_categories_category',
                columns: [
                    {
                        name: 'channelId',
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
            'channel_categories_category',
            new TableForeignKey({
                columnNames: ['channelId'],
                referencedColumnNames: ['id'],
                referencedTableName: 'channel',
                onDelete: 'CASCADE',
            })
        );

        await queryRunner.createForeignKey(
            'channel_categories_category',
            new TableForeignKey({
                columnNames: ['categoryId'],
                referencedColumnNames: ['id'],
                referencedTableName: 'category',
                onDelete: 'CASCADE',
            })
        );

        // Insert some default categories
        await queryRunner.query(`
            INSERT INTO category (name, description, color, "order") VALUES
            ('Deportes', 'Canales de deportes y fútbol', '#FF6B6B', 1),
            ('Noticias', 'Canales de noticias y periodismo', '#4ECDC4', 2),
            ('Chimentos', 'Entretenimiento, farándula y chimentos', '#45B7D1', 3),
            ('Música', 'Canales de música y radio', '#96CEB4', 4),
            ('Humor', 'Canales de comedia y humor', '#FFEAA7', 5),
            ('Política', 'Canales de política y debate', '#DDA0DD', 6),
            ('Tecnología', 'Canales de tecnología e innovación', '#98D8C8', 7),
            ('Cultura', 'Canales de cultura y arte', '#F7DC6F', 8)
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop foreign key constraints
        const table = await queryRunner.getTable('channel_categories_category');
        if (table) {
            const foreignKeys = table.foreignKeys;
            for (const foreignKey of foreignKeys) {
                await queryRunner.dropForeignKey('channel_categories_category', foreignKey);
            }
        }

        // Drop junction table
        await queryRunner.dropTable('channel_categories_category');
        
        // Drop categories table
        await queryRunner.dropTable('category');
    }
}
