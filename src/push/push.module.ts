import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PushService } from './push.service';
import { PushController } from './push.controller';
import { PushScheduler } from './push.scheduler';
import { PushSubscriptionEntity } from './push-subscription.entity';
import { Device } from '../users/device.entity';
import { UserSubscription } from '../users/user-subscription.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { Schedule } from '../schedules/schedules.entity';
import { Program } from '../programs/programs.entity';
import { Channel } from '../channels/channels.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PushSubscriptionEntity,
      Device,
      UserSubscription,
      Schedule,
      Program,
      Channel,
    ]),
    NotificationsModule,
  ],
  providers: [PushService, PushScheduler],
  controllers: [PushController],
  exports: [PushService],
})
export class PushModule {}