import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { RedisService } from '../redis/redis.service';

interface TokenInfo {
  accessToken: string;
  expiresAt: number; // Unix timestamp in milliseconds
  refreshedAt: number; // Unix timestamp in milliseconds
}

@Injectable()
export class TokenRefreshService {
  private readonly logger = new Logger(TokenRefreshService.name);
  private readonly TWITCH_TOKEN_PREFIX = 'token:twitch:app_access';
  private readonly KICK_TOKEN_PREFIX = 'token:kick:app_access';
  private readonly TOKEN_EXPIRY_DAYS = 60; // Tokens last ~60 days
  private readonly REFRESH_THRESHOLD_DAYS = 50; // Refresh when 50 days old (10 days before expiry)

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Get Twitch app access token (from Redis cache or env fallback)
   */
  async getTwitchAccessToken(): Promise<string | null> {
    // Try Redis first
    const cached = await this.redisService.get<TokenInfo>(this.TWITCH_TOKEN_PREFIX);
    if (cached && cached.accessToken && Date.now() < cached.expiresAt) {
      return cached.accessToken;
    }

    // Fallback to env var
    const envToken = this.configService.get<string>('TWITCH_APP_ACCESS_TOKEN');
    if (envToken) {
      // Store in Redis with estimated expiration (60 days from now)
      const expiresAt = Date.now() + this.TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
      await this.redisService.set(
        this.TWITCH_TOKEN_PREFIX,
        {
          accessToken: envToken,
          expiresAt,
          refreshedAt: Date.now(),
        },
        this.TOKEN_EXPIRY_DAYS * 24 * 60 * 60, // TTL in seconds
      );
      return envToken;
    }

    return null;
  }

  /**
   * Get Kick app access token (from Redis cache or env fallback)
   */
  async getKickAccessToken(): Promise<string | null> {
    // Try Redis first
    const cached = await this.redisService.get<TokenInfo>(this.KICK_TOKEN_PREFIX);
    if (cached && cached.accessToken && Date.now() < cached.expiresAt) {
      return cached.accessToken;
    }

    // Fallback to env var
    const envToken = this.configService.get<string>('KICK_APP_ACCESS_TOKEN');
    if (envToken) {
      // Store in Redis with estimated expiration (60 days from now)
      const expiresAt = Date.now() + this.TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
      await this.redisService.set(
        this.KICK_TOKEN_PREFIX,
        {
          accessToken: envToken,
          expiresAt,
          refreshedAt: Date.now(),
        },
        this.TOKEN_EXPIRY_DAYS * 24 * 60 * 60, // TTL in seconds
      );
      return envToken;
    }

    return null;
  }

  /**
   * Refresh Twitch app access token using Client Credentials flow
   * Docs: https://dev.twitch.tv/docs/authentication/getting-tokens-oauth#oauth-client-credentials-flow
   */
  async refreshTwitchToken(): Promise<boolean> {
    const clientId = this.configService.get<string>('TWITCH_CLIENT_ID');
    const clientSecret = this.configService.get<string>('TWITCH_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      this.logger.error('❌ Twitch client credentials not configured');
      return false;
    }

    try {
      // Use application/x-www-form-urlencoded format as per Twitch API
      const params = new URLSearchParams();
      params.append('client_id', clientId);
      params.append('client_secret', clientSecret);
      params.append('grant_type', 'client_credentials');

      const response = await axios.post(
        'https://id.twitch.tv/oauth2/token',
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      const { access_token, expires_in } = response.data;

      if (!access_token) {
        this.logger.error('❌ Twitch token refresh failed: no access_token in response');
        return false;
      }

      // expires_in is in seconds, convert to milliseconds
      const expiresAt = Date.now() + (expires_in * 1000);
      const refreshedAt = Date.now();

      // Store in Redis
      const tokenInfo: TokenInfo = {
        accessToken: access_token,
        expiresAt,
        refreshedAt,
      };

      // Store with TTL slightly longer than expiration to ensure we have it
      const ttlSeconds = expires_in + 3600; // Add 1 hour buffer
      await this.redisService.set(this.TWITCH_TOKEN_PREFIX, tokenInfo, ttlSeconds);

      this.logger.log(
        `✅ Twitch token refreshed successfully. Expires in ${Math.round(expires_in / 86400)} days`,
      );

      // Log instructions for updating env var (for manual update if needed)
      this.logger.warn(
        `⚠️ IMPORTANT: Update TWITCH_APP_ACCESS_TOKEN env var to: ${access_token.substring(0, 20)}...`,
      );

      return true;
    } catch (error: any) {
      this.logger.error(
        `❌ Failed to refresh Twitch token: ${error.message}`,
        error.response?.data,
      );
      return false;
    }
  }

  /**
   * Refresh Kick app access token using Client Credentials flow
   * Endpoint: https://id.kick.com/oauth/token
   * Uses the same Client Credentials flow as Twitch
   */
  async refreshKickToken(): Promise<boolean> {
    const clientId = this.configService.get<string>('KICK_CLIENT_ID');
    const clientSecret = this.configService.get<string>('KICK_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      this.logger.error('❌ Kick client credentials not configured');
      return false;
    }

    try {
      // Use application/x-www-form-urlencoded format as per Kick API
      const params = new URLSearchParams();
      params.append('client_id', clientId);
      params.append('client_secret', clientSecret);
      params.append('grant_type', 'client_credentials');

      const response = await axios.post(
        'https://id.kick.com/oauth/token',
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      const { access_token, expires_in } = response.data;

      if (!access_token) {
        this.logger.error('❌ Kick token refresh failed: no access_token in response');
        return false;
      }

      // expires_in is in seconds, convert to milliseconds
      const expiresAt = Date.now() + (expires_in * 1000);
      const refreshedAt = Date.now();

      // Store in Redis
      const tokenInfo: TokenInfo = {
        accessToken: access_token,
        expiresAt,
        refreshedAt,
      };

      // Store with TTL slightly longer than expiration
      const ttlSeconds = expires_in + 3600; // Add 1 hour buffer
      await this.redisService.set(this.KICK_TOKEN_PREFIX, tokenInfo, ttlSeconds);

      this.logger.log(
        `✅ Kick token refreshed successfully. Expires in ${Math.round(expires_in / 86400)} days`,
      );

      // Log instructions for updating env var
      this.logger.warn(
        `⚠️ IMPORTANT: Update KICK_APP_ACCESS_TOKEN env var to: ${access_token.substring(0, 20)}...`,
      );

      return true;
    } catch (error: any) {
      this.logger.error(
        `❌ Failed to refresh Kick token: ${error.message}`,
        error.response?.data,
      );
      return false;
    }
  }

  /**
   * Check if a token needs refreshing (within 10 days of expiration)
   */
  private async shouldRefreshToken(tokenPrefix: string): Promise<boolean> {
    const cached = await this.redisService.get<TokenInfo>(tokenPrefix);
    
    if (!cached) {
      // No cached token, check if we have env var
      if (tokenPrefix === this.TWITCH_TOKEN_PREFIX) {
        return !!this.configService.get<string>('TWITCH_APP_ACCESS_TOKEN');
      } else {
        return !!this.configService.get<string>('KICK_APP_ACCESS_TOKEN');
      }
    }

    // Check if token is within refresh threshold (50 days old = 10 days before 60-day expiry)
    const ageInDays = (Date.now() - cached.refreshedAt) / (24 * 60 * 60 * 1000);
    return ageInDays >= this.REFRESH_THRESHOLD_DAYS;
  }

  /**
   * Check and refresh tokens if needed
   */
  async checkAndRefreshTokens(): Promise<void> {
    this.logger.log('🔄 Checking token expiration status...');

    // Check Twitch token
    const shouldRefreshTwitch = await this.shouldRefreshToken(this.TWITCH_TOKEN_PREFIX);
    if (shouldRefreshTwitch) {
      this.logger.log('🔄 Refreshing Twitch token...');
      await this.refreshTwitchToken();
    } else {
      const cached = await this.redisService.get<TokenInfo>(this.TWITCH_TOKEN_PREFIX);
      if (cached) {
        const daysUntilExpiry = Math.round((cached.expiresAt - Date.now()) / (24 * 60 * 60 * 1000));
        this.logger.debug(`✅ Twitch token still valid (expires in ${daysUntilExpiry} days)`);
      }
    }

    // Check Kick token
    const shouldRefreshKick = await this.shouldRefreshToken(this.KICK_TOKEN_PREFIX);
    if (shouldRefreshKick) {
      this.logger.log('🔄 Refreshing Kick token...');
      await this.refreshKickToken();
    } else {
      const cached = await this.redisService.get<TokenInfo>(this.KICK_TOKEN_PREFIX);
      if (cached) {
        const daysUntilExpiry = Math.round((cached.expiresAt - Date.now()) / (24 * 60 * 60 * 1000));
        this.logger.debug(`✅ Kick token still valid (expires in ${daysUntilExpiry} days)`);
      }
    }
  }

  /**
   * Get token status information (for API endpoints)
   */
  async getTwitchTokenStatus(): Promise<{
    hasToken: boolean;
    tokenPreview?: string;
    expiresAt?: string;
    daysUntilExpiry?: number;
    ageInDays?: number;
  }> {
    const token = await this.getTwitchAccessToken();
    const cached = await this.redisService.get<TokenInfo>(this.TWITCH_TOKEN_PREFIX);

    if (!token) {
      return { hasToken: false };
    }

    const now = Date.now();
    const expiresAt = cached?.expiresAt;
    const refreshedAt = cached?.refreshedAt;

    return {
      hasToken: true,
      tokenPreview: `${token.substring(0, 20)}...`,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      daysUntilExpiry: expiresAt ? Math.round((expiresAt - now) / (24 * 60 * 60 * 1000)) : undefined,
      ageInDays: refreshedAt ? Math.round((now - refreshedAt) / (24 * 60 * 60 * 1000)) : undefined,
    };
  }

  /**
   * Get token status information (for API endpoints)
   */
  async getKickTokenStatus(): Promise<{
    hasToken: boolean;
    tokenPreview?: string;
    expiresAt?: string;
    daysUntilExpiry?: number;
    ageInDays?: number;
  }> {
    const token = await this.getKickAccessToken();
    const cached = await this.redisService.get<TokenInfo>(this.KICK_TOKEN_PREFIX);

    if (!token) {
      return { hasToken: false };
    }

    const now = Date.now();
    const expiresAt = cached?.expiresAt;
    const refreshedAt = cached?.refreshedAt;

    return {
      hasToken: true,
      tokenPreview: `${token.substring(0, 20)}...`,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      daysUntilExpiry: expiresAt ? Math.round((expiresAt - now) / (24 * 60 * 60 * 1000)) : undefined,
      ageInDays: refreshedAt ? Math.round((now - refreshedAt) / (24 * 60 * 60 * 1000)) : undefined,
    };
  }
}

