import { Injectable, OnModuleInit } from '@nestjs/common';
import * as Sentry from '@sentry/node';

@Injectable()
export class BetterStackService implements OnModuleInit {
  private readonly dsn: string;
  private readonly environment: string;

  constructor() {
    this.dsn = process.env.BETTERSTACK_DSN || '';
    this.environment = process.env.NODE_ENV || 'development';
  }

  onModuleInit() {
    if (!this.dsn) {
      console.warn('⚠️ BetterStack DSN not configured. BetterStack monitoring will be disabled.');
      return;
    }

    // Initialize BetterStack (using Sentry SDK for now, will be replaced with BetterStack SDK)
    Sentry.init({
      dsn: this.dsn,
      environment: this.environment,
      // Performance Monitoring
      tracesSampleRate: 1.0,
      // Error Monitoring
      beforeSend(event) {
        // Filter out health check errors
        if (event.request?.url?.includes('/health')) {
          return null;
        }
        return event;
      },
    });

    console.log('✅ BetterStack monitoring initialized');
  }

  /**
   * Capture and report errors with context
   */
  captureException(error: Error, context?: Record<string, any>) {
    if (!this.dsn) return;

    Sentry.withScope((scope) => {
      if (context) {
        Object.entries(context).forEach(([key, value]) => {
          scope.setExtra(key, value);
        });
      }
      Sentry.captureException(error);
    });
  }

  /**
   * Capture custom messages with severity levels
   */
  captureMessage(message: string, level: Sentry.SeverityLevel = 'error', context?: Record<string, any>) {
    if (!this.dsn) return;

    Sentry.withScope((scope) => {
      if (context) {
        Object.entries(context).forEach(([key, value]) => {
          scope.setExtra(key, value);
        });
      }
      Sentry.captureMessage(message, level);
    });
  }

  /**
   * Set user context for error tracking
   */
  setUser(user: { id: string; email?: string; username?: string }) {
    if (!this.dsn) return;
    Sentry.setUser(user);
  }

  /**
   * Set tags for better error categorization
   */
  setTag(key: string, value: string) {
    if (!this.dsn) return;
    Sentry.setTag(key, value);
  }

  /**
   * Add breadcrumb for debugging
   */
  addBreadcrumb(breadcrumb: Sentry.Breadcrumb) {
    if (!this.dsn) return;
    Sentry.addBreadcrumb(breadcrumb);
  }

  /**
   * Check if BetterStack is properly configured
   */
  isConfigured(): boolean {
    return !!this.dsn;
  }
}
