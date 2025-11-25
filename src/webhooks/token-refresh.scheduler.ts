import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TokenRefreshService } from './token-refresh.service';

@Injectable()
export class TokenRefreshScheduler {
  private readonly logger = new Logger(TokenRefreshScheduler.name);

  constructor(private readonly tokenRefreshService: TokenRefreshService) {}

  /**
   * Check and refresh tokens daily at 2 AM (to avoid peak hours)
   * Runs every day to ensure tokens are refreshed before expiration
   */
  @Cron('0 2 * * *', {
    timeZone: 'America/Argentina/Buenos_Aires',
  })
  async handleTokenRefresh() {
    this.logger.log('⏰ Starting scheduled token refresh check...');
    
    try {
      await this.tokenRefreshService.checkAndRefreshTokens();
      this.logger.log('✅ Token refresh check completed');
    } catch (error: any) {
      this.logger.error(`❌ Error during token refresh check: ${error.message}`, error.stack);
    }
  }
}



