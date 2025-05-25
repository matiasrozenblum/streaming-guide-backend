import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateDevicesAndSubscriptions1747430368000 implements MigrationInterface {
    name = 'CreateDevicesAndSubscriptions1747430368000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create notification method enum
        await queryRunner.query(`CREATE TYPE "public"."user_subscriptions_notification_method_enum" AS ENUM('push', 'email', 'both')`);
        
        // Create devices table
        await queryRunner.query(`CREATE TABLE "devices" (
            "id" uuid NOT NULL DEFAULT uuid_generate_v4(), 
            "device_id" character varying NOT NULL, 
            "device_name" character varying, 
            "device_type" character varying, 
            "user_agent" text, 
            "last_seen" TIMESTAMP, 
            "user_id" integer, 
            "created_at" TIMESTAMP NOT NULL DEFAULT now(), 
            "updated_at" TIMESTAMP NOT NULL DEFAULT now(), 
            CONSTRAINT "UQ_device_id" UNIQUE ("device_id"), 
            CONSTRAINT "PK_devices" PRIMARY KEY ("id")
        )`);
        
        // Create user_subscriptions table
        await queryRunner.query(`CREATE TABLE "user_subscriptions" (
            "id" uuid NOT NULL DEFAULT uuid_generate_v4(), 
            "notification_method" "public"."user_subscriptions_notification_method_enum" NOT NULL DEFAULT 'both', 
            "is_active" boolean NOT NULL DEFAULT true, 
            "user_id" integer, 
            "program_id" integer, 
            "created_at" TIMESTAMP NOT NULL DEFAULT now(), 
            "updated_at" TIMESTAMP NOT NULL DEFAULT now(), 
            CONSTRAINT "UQ_user_program" UNIQUE ("user_id", "program_id"), 
            CONSTRAINT "PK_user_subscriptions" PRIMARY KEY ("id")
        )`);
        
        // Update push_subscriptions table to reference devices instead of device_id string
        await queryRunner.query(`ALTER TABLE "push_subscriptions" DROP CONSTRAINT IF EXISTS "UQ_push_subscriptions_device_endpoint"`);
        await queryRunner.query(`ALTER TABLE "push_subscriptions" DROP COLUMN "device_id"`);
        await queryRunner.query(`ALTER TABLE "push_subscriptions" ADD "device_id" uuid`);
        
        // Add foreign key constraints
        await queryRunner.query(`ALTER TABLE "devices" ADD CONSTRAINT "FK_devices_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_subscriptions" ADD CONSTRAINT "FK_user_subscriptions_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_subscriptions" ADD CONSTRAINT "FK_user_subscriptions_program" FOREIGN KEY ("program_id") REFERENCES "program"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "push_subscriptions" ADD CONSTRAINT "FK_push_subscriptions_device" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        
        // Add unique constraint for push subscriptions
        await queryRunner.query(`ALTER TABLE "push_subscriptions" ADD CONSTRAINT "UQ_push_subscriptions_device_endpoint" UNIQUE ("device_id", "endpoint")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop foreign key constraints
        await queryRunner.query(`ALTER TABLE "push_subscriptions" DROP CONSTRAINT "FK_push_subscriptions_device"`);
        await queryRunner.query(`ALTER TABLE "user_subscriptions" DROP CONSTRAINT "FK_user_subscriptions_program"`);
        await queryRunner.query(`ALTER TABLE "user_subscriptions" DROP CONSTRAINT "FK_user_subscriptions_user"`);
        await queryRunner.query(`ALTER TABLE "devices" DROP CONSTRAINT "FK_devices_user"`);
        
        // Revert push_subscriptions table
        await queryRunner.query(`ALTER TABLE "push_subscriptions" DROP CONSTRAINT "UQ_push_subscriptions_device_endpoint"`);
        await queryRunner.query(`ALTER TABLE "push_subscriptions" DROP COLUMN "device_id"`);
        await queryRunner.query(`ALTER TABLE "push_subscriptions" ADD "device_id" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "push_subscriptions" ADD CONSTRAINT "UQ_push_subscriptions_device_endpoint" UNIQUE ("device_id", "endpoint")`);
        
        // Drop tables
        await queryRunner.query(`DROP TABLE "user_subscriptions"`);
        await queryRunner.query(`DROP TABLE "devices"`);
        
        // Drop enum
        await queryRunner.query(`DROP TYPE "public"."user_subscriptions_notification_method_enum"`);
    }
} 