import { Injectable } from '@nestjs/common';
import { SentryService } from '../sentry/sentry.service';
import { BetterStackService } from '../betterstack/betterstack.service';

@Injectable()
export class DualMonitoringService {
  constructor(
    private readonly sentryService: SentryService,
    private readonly betterStackService: BetterStackService,
  ) {}

  /**
   * Capture and report errors with context to both services
   */
  captureException(error: Error, context?: Record<string, any>) {
    // Send to Sentry
    this.sentryService.captureException(error, context);
    
    // Send to BetterStack
    this.betterStackService.captureException(error, context);
  }

  /**
   * Capture custom messages with severity levels to both services
   */
  captureMessage(message: string, level: any = 'error', context?: Record<string, any>) {
    // Send to Sentry
    this.sentryService.captureMessage(message, level, context);
    
    // Send to BetterStack
    this.betterStackService.captureMessage(message, level, context);
  }

  /**
   * Set user context for error tracking in both services
   */
  setUser(user: { id: string; email?: string; username?: string }) {
    this.sentryService.setUser(user);
    this.betterStackService.setUser(user);
  }

  /**
   * Set tags for better error categorization in both services
   */
  setTag(key: string, value: string) {
    this.sentryService.setTag(key, value);
    this.betterStackService.setTag(key, value);
  }

  /**
   * Add breadcrumb for debugging in both services
   */
  addBreadcrumb(breadcrumb: any) {
    this.sentryService.addBreadcrumb(breadcrumb);
    this.betterStackService.addBreadcrumb(breadcrumb);
  }

  /**
   * Get monitoring status for both services
   */
  getMonitoringStatus() {
    return {
      sentry: {
        configured: true, // Sentry is always configured in this setup
        service: 'sentry',
      },
      betterStack: {
        configured: this.betterStackService.isConfigured(),
        service: 'betterstack',
      },
    };
  }
}
