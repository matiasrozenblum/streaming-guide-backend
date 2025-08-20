import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SchedulesService } from './schedules.service';
import { SchedulesController } from './schedules.controller';
import { Schedule } from './schedules.entity';
import { Program } from '../programs/programs.entity';
import { Panelist } from '../panelists/panelists.entity';
import { RedisModule } from '../redis/redis.module';
import { YoutubeLiveModule } from '../youtube/youtube-live.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WeeklyOverridesModule } from './weekly-overrides.module';
import { ConfigModule } from '../config/config.module';
import { SentryModule } from '../sentry/sentry.module';
import { WeeklyScheduleManagerService } from './weekly-schedule-manager.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Schedule, Program, Panelist]),
    RedisModule,
    YoutubeLiveModule,
    NotificationsModule,
    WeeklyOverridesModule,
    ConfigModule,
    SentryModule,
  ],
  controllers: [SchedulesController],
  providers: [SchedulesService, WeeklyScheduleManagerService],
  exports: [SchedulesService, TypeOrmModule],
})
export class SchedulesModule {}
