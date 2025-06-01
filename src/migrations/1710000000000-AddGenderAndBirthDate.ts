import { MigrationInterface, QueryRunner } from "typeorm";

export class AddGenderAndBirthDate1710000000000 implements MigrationInterface {
    name = 'AddGenderAndBirthDate1710000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // First create the enum type for gender
        await queryRunner.query(`CREATE TYPE "public"."users_gender_enum" AS ENUM('male', 'female', 'non_binary', 'rather_not_say')`);
        
        // Add the new columns
        await queryRunner.query(`ALTER TABLE "users" ADD "gender" "public"."users_gender_enum"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "birth_date" date`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Remove the columns
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "birth_date"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "gender"`);
        
        // Remove the enum type
        await queryRunner.query(`DROP TYPE "public"."users_gender_enum"`);
    }
} 