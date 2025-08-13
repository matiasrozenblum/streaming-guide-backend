import { Module } from '@nestjs/common';
import { SentryModule } from '../sentry/sentry.module';
import { BetterStackModule } from '../betterstack/betterstack.module';
import { DualMonitoringService } from './dual-monitoring.service';

@Module({
  imports: [SentryModule, BetterStackModule],
  providers: [DualMonitoringService],
  exports: [DualMonitoringService],
})
export class MonitoringModule {}
