import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateDevicesAndSubscriptions1747430368000 implements MigrationInterface {
    name = 'CreateDevicesAndSubscriptions1747430368000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create notification method enum (robust, idempotent)
        await queryRunner.query(`
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'user_subscriptions_notification_method_enum'
    ) THEN
        CREATE TYPE "public"."user_subscriptions_notification_method_enum" AS ENUM('push', 'email', 'both');
    END IF;
END$$;
        `);
        
        // Create devices table
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "devices" (
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
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "user_subscriptions" (
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

        // Create push_subscriptions table if it doesn't exist
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "push_subscriptions" (
            "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
            "endpoint" text,
            "p256dh" text,
            "auth" text,
            "created_at" timestamp DEFAULT now(),
            "device_id" uuid,
            CONSTRAINT "PK_push_subscriptions" PRIMARY KEY ("id")
        )`);
        
        // Update push_subscriptions table to reference devices instead of device_id string
        await queryRunner.query(`ALTER TABLE "push_subscriptions" DROP CONSTRAINT IF EXISTS "UQ_push_subscriptions_device_endpoint"`);
        // Only drop column if it exists and is not uuid
        await queryRunner.query(`DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name='push_subscriptions' AND column_name='device_id' AND data_type='character varying'
            ) THEN
                ALTER TABLE "push_subscriptions" DROP COLUMN "device_id";
            END IF;
        END$$;`);
        // Add device_id column if not exists (uuid)
        await queryRunner.query(`DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name='push_subscriptions' AND column_name='device_id' AND data_type='uuid'
            ) THEN
                ALTER TABLE "push_subscriptions" ADD "device_id" uuid;
            END IF;
        END$$;`);
        
        // Add foreign key constraints (robust DO blocks)
        await queryRunner.query(`DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'FK_devices_user' AND table_name = 'devices'
            ) THEN
                ALTER TABLE "devices" ADD CONSTRAINT "FK_devices_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
            END IF;
        END$$;`);
        await queryRunner.query(`DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'FK_user_subscriptions_user' AND table_name = 'user_subscriptions'
            ) THEN
                ALTER TABLE "user_subscriptions" ADD CONSTRAINT "FK_user_subscriptions_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
            END IF;
        END$$;`);
        await queryRunner.query(`DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'FK_user_subscriptions_program' AND table_name = 'user_subscriptions'
            ) THEN
                ALTER TABLE "user_subscriptions" ADD CONSTRAINT "FK_user_subscriptions_program" FOREIGN KEY ("program_id") REFERENCES "program"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
            END IF;
        END$$;`);
        await queryRunner.query(`DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'FK_push_subscriptions_device' AND table_name = 'push_subscriptions'
            ) THEN
                ALTER TABLE "push_subscriptions" ADD CONSTRAINT "FK_push_subscriptions_device" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
            END IF;
        END$$;`);
        // Add unique constraint for push subscriptions
        await queryRunner.query(`DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'UQ_push_subscriptions_device_endpoint' AND table_name = 'push_subscriptions'
            ) THEN
                ALTER TABLE "push_subscriptions" ADD CONSTRAINT "UQ_push_subscriptions_device_endpoint" UNIQUE ("device_id", "endpoint");
            END IF;
        END$$;`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop foreign key constraints
        await queryRunner.query(`ALTER TABLE "push_subscriptions" DROP CONSTRAINT IF EXISTS "FK_push_subscriptions_device"`);
        await queryRunner.query(`ALTER TABLE "user_subscriptions" DROP CONSTRAINT IF EXISTS "FK_user_subscriptions_program"`);
        await queryRunner.query(`ALTER TABLE "user_subscriptions" DROP CONSTRAINT IF EXISTS "FK_user_subscriptions_user"`);
        await queryRunner.query(`ALTER TABLE "devices" DROP CONSTRAINT IF EXISTS "FK_devices_user"`);
        
        // Revert push_subscriptions table
        await queryRunner.query(`ALTER TABLE "push_subscriptions" DROP CONSTRAINT IF EXISTS "UQ_push_subscriptions_device_endpoint"`);
        // Only drop column if it exists
        await queryRunner.query(`DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name='push_subscriptions' AND column_name='device_id' AND data_type='uuid'
            ) THEN
                ALTER TABLE "push_subscriptions" DROP COLUMN "device_id";
            END IF;
        END$$;`);
        // Add back device_id as character varying if needed
        await queryRunner.query(`ALTER TABLE "push_subscriptions" ADD COLUMN IF NOT EXISTS "device_id" character varying`);
        await queryRunner.query(`ALTER TABLE "push_subscriptions" ADD CONSTRAINT IF NOT EXISTS "UQ_push_subscriptions_device_endpoint" UNIQUE ("device_id", "endpoint")`);
        
        // Drop tables
        await queryRunner.query(`DROP TABLE IF EXISTS "user_subscriptions"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "devices"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "push_subscriptions"`);
        
        // Drop enum
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."user_subscriptions_notification_method_enum"`);
    }
} 