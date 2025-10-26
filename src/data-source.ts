import 'dotenv/config';
import { DataSource } from 'typeorm';

import { Channel } from './channels/channels.entity';
import { Program } from './programs/programs.entity';
import { Schedule } from './schedules/schedules.entity';
import { Panelist } from './panelists/panelists.entity';
import { Config as AppConfig } from './config/config.entity';
import { User } from './users/users.entity';
import { Device } from './users/device.entity';
import { UserSubscription } from './users/user-subscription.entity';
import { PushSubscriptionEntity } from './push/push-subscription.entity';
import { Category } from './categories/categories.entity';

const isProduction = process.env.NODE_ENV === 'production';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Supabase requires SSL even for local development
  entities: [
    Channel,
    Program,
    Schedule,
    Panelist,
    AppConfig,
    User,
    Device,
    UserSubscription,
    PushSubscriptionEntity,
    Category,
  ],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
  logging: false,
          extra: {
            max: 35, // Reduced from 50. Supabase Dedicated Pooler allows 40 per user+db. With 1 instance, 35 provides buffer while maximizing throughput. Monitor actual usage.
            min: 5, // Keep minimum connections ready
            acquireTimeoutMillis: 30000, // Increased to 30 seconds to handle peak load
            createTimeoutMillis: 15000, // 15 seconds to create connection
            destroyTimeoutMillis: 5000, // 5 seconds to destroy connection
            idleTimeoutMillis: 30000, // 30 seconds idle timeout
            reapIntervalMillis: 1000, // Check for idle connections every second
            createRetryIntervalMillis: 200, // Retry connection creation every 200ms
            statement_timeout: 15000, // 15 seconds for query execution
            connectionTimeoutMillis: 30000, // Increased to 30 seconds for better resilience
            retryDelayMillis: 1000, // Add connection retry logic
            retryAttempts: 3,
          },
});
