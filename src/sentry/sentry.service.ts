import { Injectable, OnModuleInit } from '@nestjs/common';
import * as Sentry from '@sentry/node';

@Injectable()
export class SentryService implements OnModuleInit {
  onModuleInit() {
    // Initialize Sentry
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
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
  }

  /**
   * Capture and report errors with context
   */
  captureException(error: Error, context?: Record<string, any>) {
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
    Sentry.setUser(user);
  }

  /**
   * Set tags for better error categorization
   */
  setTag(key: string, value: string) {
    Sentry.setTag(key, value);
  }

  /**
   * Add breadcrumb for debugging
   */
  addBreadcrumb(breadcrumb: Sentry.Breadcrumb) {
    Sentry.addBreadcrumb(breadcrumb);
  }
} 