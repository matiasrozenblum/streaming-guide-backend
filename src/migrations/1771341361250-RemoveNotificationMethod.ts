import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveNotificationMethod1771341361250 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Drop column from user_subscriptions if exists
        await queryRunner.query(`ALTER TABLE "user_subscriptions" DROP COLUMN IF EXISTS "notification_method"`);
        // Drop type if exists
        // Note: We might want to keep the type if it is used elsewhere, but since we are removing usage, we should check.
        // For now, let's just drop the column.

        // Drop column from user_streamer_subscriptions if exists
        await queryRunner.query(`ALTER TABLE "user_streamer_subscriptions" DROP COLUMN IF EXISTS "notification_method"`);

        // Drop types if they exist - clean up
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."user_subscriptions_notification_method_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."user_streamer_subscriptions_notification_method_enum"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop types if they exist to avoid conflict on recreation
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."user_subscriptions_notification_method_enum"`);
        await queryRunner.query(`CREATE TYPE "public"."user_subscriptions_notification_method_enum" AS ENUM('push', 'email', 'both')`);
        await queryRunner.query(`ALTER TABLE "user_subscriptions" ADD "notification_method" "public"."user_subscriptions_notification_method_enum" NOT NULL DEFAULT 'both'`);

        await queryRunner.query(`DROP TYPE IF EXISTS "public"."user_streamer_subscriptions_notification_method_enum"`);
        await queryRunner.query(`CREATE TYPE "public"."user_streamer_subscriptions_notification_method_enum" AS ENUM('push', 'email', 'both')`);
        await queryRunner.query(`ALTER TABLE "user_streamer_subscriptions" ADD "notification_method" "public"."user_streamer_subscriptions_notification_method_enum" NOT NULL DEFAULT 'both'`);
    }

}
