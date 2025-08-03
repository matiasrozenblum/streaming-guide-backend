import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';

import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';
import { Schedule } from './schedules.entity';
import { Program } from '../programs/programs.entity';
import { Panelist } from '../panelists/panelists.entity';
import { WeeklyOverridesService } from './weekly-overrides.service';
import { WeeklyOverridesController } from './weekly-overrides.controller';
import { WeeklyScheduleManagerService } from './weekly-schedule-manager.service';
import { WeeklyScheduleManagerController } from './weekly-schedule-manager.controller';
import { YoutubeLiveModule } from '../youtube/youtube-live.module';
import { RedisModule } from '../redis/redis.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ConfigModule } from '../config/config.module';
import { SentryModule } from '../sentry/sentry.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Schedule, Program, Panelist]),
    ScheduleModule.forRoot(), // For cron jobs
    forwardRef(() => YoutubeLiveModule),
    RedisModule,
    NotificationsModule,
    ConfigModule,
    SentryModule,
  ],
  controllers: [
    SchedulesController, 
    WeeklyOverridesController,
    WeeklyScheduleManagerController
  ],
  providers: [
    SchedulesService, 
    WeeklyOverridesService, 
    WeeklyScheduleManagerService
  ],
  exports: [
    SchedulesService, 
    WeeklyOverridesService, 
    WeeklyScheduleManagerService
  ],
})
export class SchedulesModule {}
