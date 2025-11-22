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
 */
interface KickWebhookPayload {
  event?: string; // Event type, e.g., "livestream.status.updated"
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
  // Legacy format support (if Kick sends direct fields)
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

      // Kick returns public key as PEM string directly or in response body
      const publicKeyText = await response.text();
      let publicKey = publicKeyText.trim();
      
      // If response is JSON, extract the key
      if (publicKey.startsWith('{')) {
        try {
          const data = JSON.parse(publicKey);
          publicKey = data.public_key || data.publicKey || data.key || publicKeyText;
        } catch {
          // Not JSON, use as-is
        }
      }
      
      // Ensure it's in PEM format
      if (!publicKey.includes('BEGIN PUBLIC KEY')) {
        // If it's just the key content, wrap it in PEM headers
        publicKey = `-----BEGIN PUBLIC KEY-----\n${publicKey}\n-----END PUBLIC KEY-----`;
      }
      
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
      const publicKey = crypto.createPublicKey(publicKeyPEM);
      
      // Verify signature using RSA with SHA256
      const verify = crypto.createVerify('SHA256');
      verify.update(messageToVerify);
      verify.end();
      
      const isValid = verify.verify(publicKey, signatureBuffer);
      
      if (!isValid) {
        this.logger.warn('❌ Signature verification failed');
      }
      
      return isValid;
    } catch (error) {
      this.logger.error('❌ Error verifying signature:', error);
      // In non-production, allow on error
      return process.env.NODE_ENV !== 'production';
    }
  }
}

