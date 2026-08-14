import { ArgumentsHost, Catch, HttpException, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

/**
 * Logs every HTTP error response.
 *
 * PerformanceInterceptor cannot do this: in the Nest request lifecycle guards
 * run *before* interceptors, so a JwtAuthGuard rejection short-circuits without
 * ever reaching it — neither its "Starting request" line nor its error branch.
 * The result was that 401s, the single most common failure in the system, left
 * no trace whatsoever in production. Diagnosing a silent client-side logout had
 * to be done by inferring deletions from push-subscription row counts.
 *
 * Exception filters run last and see everything, including guard rejections.
 */
@Catch()
export class HttpErrorLogFilter extends BaseExceptionFilter {
  private readonly logger = new Logger('HttpError');

  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() === 'http') {
      const request = host.switchToHttp().getRequest();
      const status =
        exception instanceof HttpException ? exception.getStatus() : 500;
      const message =
        exception instanceof Error ? exception.message : String(exception);

      // Auth failures are the ones worth surfacing loudly — they are invisible
      // everywhere else and they are what ends user sessions.
      const level = status === 401 || status === 403 ? 'warn' : 'error';
      const endpoint = `${request?.method} ${request?.route?.path || request?.path || request?.url?.split('?')[0]}`;
      const deviceId = request?.headers?.['x-device-id'] || 'unknown';
      const appVersion = request?.headers?.['x-app-version'] || 'unknown';
      const userId = request?.user?.id ?? 'anonymous';

      this.logger[level](
        `🔒 ${status} ${endpoint} — deviceId=${deviceId}, userId=${userId}, appVersion=${appVersion}, reason="${message}"`,
      );
    }

    super.catch(exception, host);
  }
}
