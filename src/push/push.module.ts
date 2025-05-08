import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule as NestScheduleModule } from '@nestjs/schedule';
import { PushSubscriptionEntity } from './push-subscription.entity';
import { PushService } from './push.service';
import { NotificationPreferenceEntity } from '@/notifications/notification-preference.entity';
import { PushController } from './push.controller';
import { PushScheduler }     from './push.scheduler';
import { NotificationsModule } from '@/notifications/notifications.module';
import { Schedule } from '@/schedules/schedules.entity';

@Module({
    imports: [
      // Necesitas el módulo de scheduling de Nest para que @Cron funcione
      NestScheduleModule,
      NotificationsModule,
      // Registramos los tres repositories que usamos en PushService y PushScheduler
      TypeOrmModule.forFeature([
        PushSubscriptionEntity,
        NotificationPreferenceEntity,
        Schedule,
      ]),
    ],
    controllers: [PushController],
    providers: [
      PushService,
      PushScheduler,  // ← aquí
    ],
    exports: [PushService],
  })
  export class PushModule {}