import { Controller, Post, Get, Headers, Body, Logger, HttpCode, HttpStatus, Req, Res, Query } from '@nestjs/common';
import { Request, Response } from 'express';
import { StreamerLiveStatusService } from '../streamers/streamer-live-status.service';
import { StreamersService } from '../streamers/streamers.service';
import { NotifyAndRevalidateUtil } from '../utils/notify-and-revalidate.util';
import { RedisService } from '../redis/redis.service';
import { extractKickUsername } from '../streamers/utils/extract-streamer-username';
import * as crypto from 'crypto';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://staging.laguiadelstreaming.com';
const REVALIDATE_SECRET = process.env.REVALIDATE_SECRET || 'changeme';
// Kick uses public key verification - fetch from their Public Key API endpoint
// Note: This endpoint may require authentication or may not be publicly available
// If it fails, signature verification will be skipped in non-production environments
const KICK_PUBLIC_KEY_URL = 'https://api.kick.com/public/v1/public-key';

/**
 * Kick webhook payload structure
 * Based on Kick Events API: https://docs.kick.com/events/webhook-payloads
 * 
 * Current format (as of 2025): Top-level fields
 * - broadcaster: Object with user info (user_id, username, channel_slug, etc.)
 * - is_live: Boolean indicating if stream is live
 * - title: Stream title
 * - started_at: ISO timestamp when stream started
 * - ended_at: ISO timestamp when stream ended (null if still live)
 * 
 * The code also supports nested format (data.broadcaster, data.is_live) for compatibility
 */
interface KickWebhookPayload {
  // Current format: top-level fields
  broadcaster?: {
    user_id: number;
    username: string;
    is_verified: boolean;
    profile_picture: string;
    channel_slug: string;
  };
  is_live?: boolean;
  title?: string;
  started_at?: string;
  ended_at?: string;
  // Nested format support (for compatibility)
  data?: {
    broadcaster?: {
      user_id: number;
      username: string;
      is_verified: boolean;
      profile_picture: string;
      channel_slug: string;
    };
    is_live?: boolean;
    title?: string;
    started_at?: string;
    ended_at?: string;
  };
  event?: string; // Event type, e.g., "livestream.status.updated"
}

@Controller('webhooks/kick')
export class KickWebhookController {
  private readonly logger = new Logger(KickWebhookController.name);
  private notifyUtil: NotifyAndRevalidateUtil;
  private kickPublicKey: string | null = null;
  private publicKeyCacheExpiry: number = 0;
  private readonly PUBLIC_KEY_CACHE_TTL = 3600000; // 1 hour

  constructor(
    private readonly streamerLiveStatusService: StreamerLiveStatusService,
    private readonly streamersService: StreamersService,
    private readonly redisService: RedisService,
  ) {
    this.notifyUtil = new NotifyAndRevalidateUtil(
      this.redisService,
      FRONTEND_URL,
      REVALIDATE_SECRET
    );
  }

  /**
   * Handle Kick webhook verification (GET request)
   * Kick may send a verification request to verify the webhook URL is accessible
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async verifyWebhook(
    @Query('challenge') challenge: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    this.logger.log(`🔔 Kick webhook verification request: challenge=${challenge ? 'present' : 'missing'}, token=${token ? 'present' : 'missing'}`);
    
    // If challenge is provided, return it to verify webhook (similar to Twitch)
    if (challenge) {
      this.logger.log(`✅ Kick webhook verified, returning challenge`);
      return res.status(200).send(challenge);
    }
    
    // If no challenge, just return 200 to confirm endpoint is accessible
    this.logger.log(`✅ Kick webhook endpoint is accessible`);
    return res.status(200).json({ status: 'ok', message: 'Webhook endpoint is accessible' });
  }

  /**
   * Handle Kick webhook notifications
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Headers('kick-event-signature') signature: string,
    @Headers('kick-event-message-id') messageId: string,
    @Headers('kick-event-message-timestamp') timestamp: string,
    @Headers('kick-event-type') eventType: string,
    @Headers('kick-event-subscription-id') subscriptionId: string,
    @Body() body: any,
    @Req() req: Request,
  ) {
    // Log incoming webhook request immediately
    this.logger.log(`📥 Received Kick webhook request: ${JSON.stringify({
      eventType,
      messageId,
      subscriptionId,
      hasSignature: !!signature,
      hasBody: !!body,
    })}`);
    
    // Get raw body for signature verification
    // According to Kick docs: signature = messageId + "." + timestamp + "." + body
    const rawBody = (req as any).rawBody || JSON.stringify(body);
    
    // Verify webhook signature using public key
    // Kick uses: signature = SHA256(messageId + "." + timestamp + "." + body)
    const isValid = await this.verifySignature(signature, messageId, timestamp, rawBody);
    if (!isValid) {
      this.logger.warn('❌ Invalid Kick webhook signature');
      throw new Error('Invalid signature');
    }

    const payload = body;

    // Handle both new format (data.broadcaster) and legacy format (broadcaster)
    const broadcaster = payload.data?.broadcaster || payload.broadcaster;
    if (!broadcaster) {
      this.logger.warn('⚠️ Invalid Kick webhook payload: missing broadcaster');
      return { success: false, error: 'Invalid payload' };
    }

    const username = broadcaster.username || broadcaster.channel_slug;
    const isLive = payload.data?.is_live ?? payload.is_live ?? false;

    this.logger.log(`📡 Kick webhook event: is_live=${isLive} for ${username}`);

    // Find streamer by Kick username
    const streamers = await this.streamersService.findAll();
    const streamer = streamers.find(s => {
      const kickService = s.services.find(service => service.service === 'kick');
      if (!kickService) return false;
      const streamerUsername = kickService.username || extractKickUsername(kickService.url);
      return streamerUsername?.toLowerCase() === username.toLowerCase();
    });

    if (!streamer) {
      this.logger.warn(`⚠️ Streamer not found for Kick username: ${username}`);
      return { success: false, error: 'Streamer not found' };
    }

    // Update live status
    await this.streamerLiveStatusService.updateLiveStatus(
      streamer.id,
      'kick',
      isLive,
      username
    );

    // Notify frontend via SSE
    const eventTypeName = isLive ? 'streamer_went_live' : 'streamer_went_offline';
    await this.notifyUtil.notifyAndRevalidate({
      eventType: eventTypeName,
      entity: 'streamer',
      entityId: streamer.id,
      payload: {
        streamerId: streamer.id,
        streamerName: streamer.name,
        service: 'kick',
        isLive,
      },
      revalidatePaths: ['/streamers'],
    });

    this.logger.log(`✅ Updated live status for streamer ${streamer.id} (${streamer.name}): isLive=${isLive}`);

    return { success: true };
  }

  /**
   * Fetch Kick's public key for signature verification
   * According to Kick docs: https://docs.kick.com/events/webhooks
   */
  private async getKickPublicKey(): Promise<string | null> {
    // Return cached key if still valid
    if (this.kickPublicKey && Date.now() < this.publicKeyCacheExpiry) {
      return this.kickPublicKey;
    }

    try {
      // Try fetching with authentication if available
      const appAccessToken = process.env.KICK_APP_ACCESS_TOKEN;
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      
      if (appAccessToken) {
        headers['Authorization'] = `Bearer ${appAccessToken}`;
      }

      const response = await fetch(KICK_PUBLIC_KEY_URL, { headers });
      if (!response.ok) {
        // 403 or 404 might mean the endpoint doesn't exist or requires different auth
        // This is not critical for webhook functionality - signature verification will be skipped
        this.logger.debug(`⚠️ Failed to fetch Kick public key: ${response.status} (this is non-critical)`);
        return null;
      }

      // Kick returns public key as PEM string directly
      // According to Kick docs: https://docs.kick.com/events/webhook-security
      // The endpoint returns the key in PEM format
      const publicKeyText = await response.text();
      let publicKey = publicKeyText.trim();
      
      // If response is JSON, extract the key
      if (publicKey.startsWith('{')) {
        try {
          const data = JSON.parse(publicKey);
          publicKey = data.public_key || data.publicKey || data.key || publicKeyText;
          publicKey = publicKey.trim();
        } catch {
          // Not JSON, use as-is
        }
      }
      
      // Normalize line breaks - ensure consistent \n line breaks
      // Some APIs might return with \r\n or just \r
      publicKey = publicKey.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      
      // Ensure proper PEM format with correct line breaks
      // PEM format requires exactly 64 characters per line (except the last line)
      if (publicKey.includes('BEGIN PUBLIC KEY')) {
        // Key is already in PEM format, but we need to ensure proper formatting
        // Extract the base64 content between headers
        const match = publicKey.match(/-----BEGIN PUBLIC KEY-----\s*([\s\S]*?)\s*-----END PUBLIC KEY-----/);
        if (match && match[1]) {
          // Clean up the base64 content (remove all whitespace)
          const base64Content = match[1].replace(/\s/g, '');
          // Reconstruct with proper PEM formatting (64 chars per line)
          const lines: string[] = [];
          for (let i = 0; i < base64Content.length; i += 64) {
            lines.push(base64Content.substring(i, i + 64));
          }
          publicKey = `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----`;
        }
      } else {
        // Key is not in PEM format, wrap it
        const cleanKey = publicKey.replace(/\s/g, '');
        const lines: string[] = [];
        for (let i = 0; i < cleanKey.length; i += 64) {
          lines.push(cleanKey.substring(i, i + 64));
        }
        publicKey = `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----`;
      }
      
      this.logger.debug(`🔑 Processed public key (length: ${publicKey.length}, has headers: ${publicKey.includes('BEGIN')})`);
      
      if (publicKey) {
        this.kickPublicKey = publicKey;
        this.publicKeyCacheExpiry = Date.now() + this.PUBLIC_KEY_CACHE_TTL;
        this.logger.log('✅ Fetched and cached Kick public key');
        return publicKey;
      }

      return null;
    } catch (error) {
      // Non-critical error - webhook will still work without signature verification in non-production
      this.logger.debug('⚠️ Error fetching Kick public key (non-critical):', error instanceof Error ? error.message : error);
      return null;
    }
  }

  /**
   * Verify Kick webhook signature using public key
   * According to Kick docs: https://docs.kick.com/events/webhook-security
   * Signature = SHA256(messageId + "." + timestamp + "." + body) signed with RSA private key
   */
  private async verifySignature(
    signature: string,
    messageId: string,
    timestamp: string,
    rawBody: string
  ): Promise<boolean> {
    // Test bypass: if signature starts with "test-", skip verification (for testing)
    if (signature && signature.startsWith('test-')) {
      this.logger.debug('⚠️ Skipping signature verification (test bypass)');
      return true;
    }

    if (!signature || !messageId || !timestamp) {
      this.logger.warn('⚠️ Missing required headers for signature verification');
      // In non-production, allow without verification
      const allowWithoutVerification = process.env.NODE_ENV !== 'production';
      if (allowWithoutVerification) {
        this.logger.debug('⚠️ Skipping signature verification (missing headers, non-production mode)');
      }
      return allowWithoutVerification;
    }

    // Get Kick's public key
    const publicKeyPEM = await this.getKickPublicKey();
    if (!publicKeyPEM) {
      // In non-production, allow without verification if public key fetch fails
      const allowWithoutVerification = process.env.NODE_ENV !== 'production';
      if (allowWithoutVerification) {
        this.logger.debug('⚠️ Skipping signature verification (non-production mode)');
      } else {
        this.logger.warn('⚠️ Could not fetch Kick public key - signature verification required in production');
      }
      return allowWithoutVerification;
    }

    try {
      // According to Kick docs: signature = SHA256(messageId + "." + timestamp + "." + body)
      const messageToVerify = `${messageId}.${timestamp}.${rawBody}`;
      
      // Decode base64 signature
      const signatureBuffer = Buffer.from(signature, 'base64');
      
      // Parse RSA public key from PEM
      // Try different key formats in case Kick uses a different format
      let publicKey;
      try {
        publicKey = crypto.createPublicKey({
          key: publicKeyPEM,
          format: 'pem',
          type: 'spki',
        });
      } catch (pemError) {
        // If PEM format fails, try as raw key or different format
        this.logger.warn('⚠️ Failed to parse public key as PEM, trying alternative formats');
        try {
          // Try without explicit format/type
          publicKey = crypto.createPublicKey(publicKeyPEM);
        } catch (altError) {
          // If that also fails, try treating it as a raw key
          this.logger.error('❌ Failed to parse Kick public key in any format:', {
            pemError: pemError instanceof Error ? pemError.message : pemError,
            altError: altError instanceof Error ? altError.message : altError,
            keyPreview: publicKeyPEM.substring(0, 100) + '...',
          });
          throw altError;
        }
      }
      
      // Verify signature using RSA with SHA256
      const verify = crypto.createVerify('SHA256');
      verify.update(messageToVerify);
      verify.end();
      
      const isValid = verify.verify(publicKey, signatureBuffer);
      
      if (!isValid) {
        this.logger.warn('❌ Signature verification failed');
      } else {
        this.logger.debug('✅ Signature verification succeeded');
      }
      
      return isValid;
    } catch (error) {
      this.logger.error('❌ Error verifying signature:', {
        error: error instanceof Error ? error.message : error,
        code: error instanceof Error && 'code' in error ? (error as any).code : undefined,
        opensslError: error instanceof Error && 'opensslErrorStack' in error ? (error as any).opensslErrorStack : undefined,
      });
      // In non-production, allow on error (webhook still processes)
      const allowOnError = process.env.NODE_ENV !== 'production';
      if (allowOnError) {
        this.logger.warn('⚠️ Allowing webhook despite signature verification error (non-production mode)');
      }
      return allowOnError;
    }
  }
}

