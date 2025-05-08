import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationPreferenceEntity } from './notification-preference.entity';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [TypeOrmModule.forFeature([NotificationPreferenceEntity])],
  providers: [NotificationsService],
  controllers: [NotificationsController],
  exports: [
    NotificationsService,
    TypeOrmModule,
  ],
})
export class NotificationsModule {}