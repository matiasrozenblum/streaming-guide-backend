import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddIsVisibleToCategories1752000000001 implements MigrationInterface {
    name = 'AddIsVisibleToCategories1752000000001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.addColumn('category', new TableColumn({
            name: 'is_visible',
            type: 'boolean',
            default: true,
            isNullable: false,
        }));
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropColumn('category', 'is_visible');
    }
}
