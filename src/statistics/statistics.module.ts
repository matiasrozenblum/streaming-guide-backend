import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { StatisticsController } from './statistics.controller';
import { StatisticsService } from './statistics.service';
import { WeeklyReportController } from './weekly-report.controller';
import { ComprehensiveReportController } from './comprehensive-report.controller';
import { ComprehensiveReportService } from './comprehensive-report.service';
import { ReportsProxyService } from './reports-proxy.service';
import { User } from '../users/users.entity';
import { UserSubscription } from '../users/user-subscription.entity';
import { Program } from '../programs/programs.entity';
import { Channel } from '../channels/channels.entity';
import { EmailService } from '../email/email.service';
import { SentryModule } from '../sentry/sentry.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserSubscription, Program, Channel]),
    ScheduleModule.forRoot(),
    SentryModule,
  ],
  controllers: [
    StatisticsController, 
    WeeklyReportController, 
    ComprehensiveReportController
  ],
  providers: [
    StatisticsService, 
    ComprehensiveReportService,
    ReportsProxyService, 
    EmailService
  ],
  exports: [StatisticsService, ComprehensiveReportService],
})
export class StatisticsModule {} 