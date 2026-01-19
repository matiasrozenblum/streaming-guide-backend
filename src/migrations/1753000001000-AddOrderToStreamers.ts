import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOrderToStreamers1753000001000 implements MigrationInterface {
    name = 'AddOrderToStreamers1753000001000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add "order" column
        await queryRunner.query(`ALTER TABLE "streamer" ADD "order" integer`);
        // Create composite index for visibility + ordering
        await queryRunner.query(`CREATE INDEX "IDX_streamer_is_visible_order" ON "streamer" ("is_visible", "order")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_streamer_is_visible_order"`);
        await queryRunner.query(`ALTER TABLE "streamer" DROP COLUMN "order"`);
    }

}

