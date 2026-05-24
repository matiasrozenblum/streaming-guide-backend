import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAppleUserOrigin1771795011558 implements MigrationInterface {
  name = 'AddAppleUserOrigin1771795011558';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."users_origin_enum" RENAME TO "users_origin_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_origin_enum" AS ENUM('traditional', 'google', 'facebook', 'apple')`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "origin" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "origin" TYPE "public"."users_origin_enum" USING "origin"::"text"::"public"."users_origin_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "origin" SET DEFAULT 'traditional'`,
    );
    await queryRunner.query(`DROP TYPE "public"."users_origin_enum_old"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."users_origin_enum_old" AS ENUM('traditional', 'google', 'facebook')`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "origin" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "origin" TYPE "public"."users_origin_enum_old" USING "origin"::"text"::"public"."users_origin_enum_old"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "origin" SET DEFAULT 'traditional'`,
    );
    await queryRunner.query(`DROP TYPE "public"."users_origin_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."users_origin_enum_old" RENAME TO "users_origin_enum"`,
    );
  }
}
