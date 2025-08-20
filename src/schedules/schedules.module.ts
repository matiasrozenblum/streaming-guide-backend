import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SchedulesService } from './schedules.service';
import { SchedulesController } from './schedules.controller';
import { Schedule } from './schedules.entity';
import { Program } from '../programs/programs.entity';
import { Panelist } from '../panelists/panelists.entity';
import { RedisModule } from '../redis/redis.module';
import { YoutubeLiveModule } from '../youtube/youtube-live.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ConfigModule } from '../config/config.module';
import { SentryModule } from '../sentry/sentry.module';
import { WeeklyScheduleManagerService } from './weekly-schedule-manager.service';
import { WeeklyOverridesService } from './weekly-overrides.service';
import { WeeklyOverridesController } from './weekly-overrides.controller';
import { WeeklyScheduleManagerController } from './weekly-schedule-manager.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Schedule, Program, Panelist]),
    RedisModule,
    forwardRef(() => YoutubeLiveModule),
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
