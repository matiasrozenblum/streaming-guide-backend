import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddStyleOverrideToProgram1750000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.addColumn('program', new TableColumn({
            name: 'style_override',
            type: 'varchar',
            isNullable: true,
        }));
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropColumn('program', 'style_override');
    }
} 