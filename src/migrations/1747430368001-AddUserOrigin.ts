import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserOrigin1747430368001 implements MigrationInterface {
    name = 'AddUserOrigin1747430368001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create the enum type for origin
        await queryRunner.query(`CREATE TYPE "public"."users_origin_enum" AS ENUM('traditional', 'google', 'facebook')`);
        
        // Add the origin column with default value 'traditional' for existing users
        await queryRunner.query(`ALTER TABLE "users" ADD "origin" "public"."users_origin_enum" NOT NULL DEFAULT 'traditional'`);
        
        // Add an index for better query performance
        await queryRunner.query(`CREATE INDEX "IDX_users_origin" ON "users" ("origin")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Remove the index
        await queryRunner.query(`DROP INDEX "IDX_users_origin"`);
        
        // Remove the column
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "origin"`);
        
        // Remove the enum type
        await queryRunner.query(`DROP TYPE "public"."users_origin_enum"`);
    }
} 