import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddIsVisibleToChannels1751000000000 implements MigrationInterface {
    name = 'AddIsVisibleToChannels1751000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.addColumn('channel', new TableColumn({
            name: 'is_visible',
            type: 'boolean',
            default: true,
            isNullable: false,
        }));
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropColumn('channel', 'is_visible');
    }
} 