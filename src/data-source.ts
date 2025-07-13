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

const isProduction = process.env.NODE_ENV === 'production';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
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
  ],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
  logging: false,
  extra: {
    max: 5, // Lower pool size to avoid saturating Supabase pooler
    statement_timeout: 20000, // 20 seconds query timeout
  },
});
