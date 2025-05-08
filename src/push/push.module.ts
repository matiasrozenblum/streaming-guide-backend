import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PushSubscriptionEntity } from './push-subscription.entity';
import { PushService } from './push.service';
import { PushController } from './push.controller';
import { PushScheduler }     from './push.scheduler';
import { NotificationsModule } from '@/notifications/notifications.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([PushSubscriptionEntity]),
        NotificationsModule,
      ],
  controllers: [PushController],
  providers: [PushService, PushScheduler],
  exports: [PushService],
})
export class PushModule {}