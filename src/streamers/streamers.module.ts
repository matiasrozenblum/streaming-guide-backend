import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StreamersController } from './streamers.controller';
import { StreamersService } from './streamers.service';
import { StreamerLiveStatusService } from './streamer-live-status.service';
import { Streamer } from './streamers.entity';
import { Category } from '../categories/categories.entity';
import { RedisModule } from '../redis/redis.module';
import { ConfigModule } from '../config/config.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { SupabaseStorageService } from '../banners/supabase-storage.service';
import { StreamerSubscriptionService } from './streamer-subscription.service';
import { StreamerSubscriptionController } from './streamer-subscription.controller';
import { UserStreamerSubscription } from '../users/user-streamer-subscription.entity';
import { User } from '../users/users.entity';
import { Device } from '../users/device.entity';
import { PushSubscriptionEntity } from '../push/push-subscription.entity';
import { PushModule } from '../push/push.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Streamer, Category, UserStreamerSubscription, User, Device, PushSubscriptionEntity]),
    RedisModule,
    ConfigModule,
    forwardRef(() => WebhooksModule),
    PushModule,
    EmailModule,
  ],
  controllers: [StreamersController, StreamerSubscriptionController],
  providers: [StreamersService, StreamerLiveStatusService, SupabaseStorageService, StreamerSubscriptionService],
  exports: [StreamersService, StreamerLiveStatusService, StreamerSubscriptionService],
})
export class StreamersModule { }

