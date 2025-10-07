import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { SentryService } from '../sentry/sentry.service';

@Injectable()
export class PerformanceInterceptor implements NestInterceptor {
  constructor(private readonly sentryService: SentryService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const startTime = Date.now();
    
    // Ensure we get the correct route path, not the full URL
    const routePath = request.route?.path || request.path || request.url.split('?')[0];
    const endpoint = `${request.method} ${routePath}`;
    const userAgent = request.headers['user-agent'] || 'unknown';
    const ip = request.ip || request.connection?.remoteAddress || 'unknown';

    // Add breadcrumb for performance tracking
    this.sentryService.addBreadcrumb({
      category: 'performance',
      message: `API Request: ${endpoint}`,
      level: 'info',
      data: {
        method: request.method,
        url: request.url,
        userAgent,
        ip,
        timestamp: new Date().toISOString(),
      },
    });

    return next.handle().pipe(
      tap((data) => {
        const responseTime = Date.now() - startTime;
        
        // Log performance metrics
        console.log(`📊 API Performance: ${endpoint} - ${responseTime}ms`);
        
        // Alert on slow responses (P3 - Medium Priority) - COMMENTED OUT
        // Temporarily disabled due to known performance issues with channels/schedules endpoint
        // TODO: Re-enable after performance optimization branch
        /*
        if (responseTime > 6000 && responseTime <= 10000) { // 5-10 seconds
          this.sentryService.captureMessage(
            `API Performance Issue - ${endpoint} taking ${responseTime}ms`,
            'warning',
            {
              service: 'api',
              error_type: 'slow_response',
              endpoint,
              response_time: responseTime,
              threshold: 6000,
              user_agent: userAgent,
              ip,
              timestamp: new Date().toISOString(),
            }
          );
          
          this.sentryService.setTag('service', 'api');
          this.sentryService.setTag('error_type', 'slow_response');
          this.sentryService.setTag('endpoint', endpoint);
        }
        */
        
        // Alert on very slow responses (P2 - High Priority)
        /*if (responseTime > 15000) { // 15+ seconds
          this.sentryService.captureMessage(
            `API Critical Performance Issue - ${endpoint} taking ${responseTime}ms`,
            'error',
            {
              service: 'api',
              error_type: 'critical_slow_response',
              endpoint,
              response_time: responseTime,
              threshold: 15000,
              user_agent: userAgent,
              ip,
              timestamp: new Date().toISOString(),
            }
          );
          
          this.sentryService.setTag('service', 'api');
          this.sentryService.setTag('error_type', 'critical_slow_response');
          this.sentryService.setTag('endpoint', endpoint);
        }*/
      }),
      catchError((error) => {
        const responseTime = Date.now() - startTime;
        
        // Log error performance metrics
        console.error(`❌ API Error: ${endpoint} - ${responseTime}ms - ${error.message}`);
        
        // Alert on API errors (P2 - High Priority)
        this.sentryService.captureMessage(
          `API Error - ${endpoint} failed after ${responseTime}ms`,
          'error',
          {
            service: 'api',
            error_type: 'api_error',
            endpoint,
            response_time: responseTime,
            error_message: error.message,
            error_status: error.status || 500,
            user_agent: userAgent,
            ip,
            timestamp: new Date().toISOString(),
          }
        );
        
        this.sentryService.setTag('service', 'api');
        this.sentryService.setTag('error_type', 'api_error');
        this.sentryService.setTag('endpoint', endpoint);
        
        throw error;
      })
    );
  }
} 
