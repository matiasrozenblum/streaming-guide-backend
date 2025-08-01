import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StatisticsController } from './statistics.controller';
import { StatisticsService } from './statistics.service';
import { WeeklyReportController } from './weekly-report.controller';
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
    SentryModule,
  ],
  controllers: [StatisticsController, WeeklyReportController],
  providers: [StatisticsService, ReportsProxyService, EmailService],
  exports: [StatisticsService],
})
export class StatisticsModule {} 