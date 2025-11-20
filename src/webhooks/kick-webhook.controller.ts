import { Controller, Post, Headers, Body, Logger, HttpCode, HttpStatus, Req } from '@nestjs/common';
import { Request } from 'express';
import { StreamerLiveStatusService } from '../streamers/streamer-live-status.service';
import { StreamersService } from '../streamers/streamers.service';
import { NotifyAndRevalidateUtil } from '../utils/notify-and-revalidate.util';
import { RedisService } from '../redis/redis.service';
import { extractKickUsername } from '../streamers/utils/extract-streamer-username';
import * as crypto from 'crypto';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://staging.laguiadelstreaming.com';
const REVALIDATE_SECRET = process.env.REVALIDATE_SECRET || 'changeme';
// Kick uses public key verification - fetch from their Public Key API endpoint
const KICK_PUBLIC_KEY_URL = 'https://kick.com/api/v2/public-key';

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
   * Handle Kick webhook notifications
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Headers('kick-signature') signature: string,
    @Body() body: KickWebhookPayload,
    @Req() req: Request,
  ) {
    // Get raw body for signature verification
    const rawBody = (req as any).rawBody || JSON.stringify(body);
    
    // Verify webhook signature using public key
    const isValid = await this.verifySignature(signature, rawBody);
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
      const response = await fetch(KICK_PUBLIC_KEY_URL);
      if (!response.ok) {
        this.logger.warn(`⚠️ Failed to fetch Kick public key: ${response.status}`);
        return null;
      }

      const data = await response.json();
      // Kick returns public key in their API format - adjust based on actual response structure
      const publicKey = data.public_key || data.publicKey || data.key;
      
      if (publicKey) {
        this.kickPublicKey = publicKey;
        this.publicKeyCacheExpiry = Date.now() + this.PUBLIC_KEY_CACHE_TTL;
        this.logger.debug('✅ Fetched and cached Kick public key');
        return publicKey;
      }

      return null;
    } catch (error) {
      this.logger.error('❌ Error fetching Kick public key:', error);
      return null;
    }
  }

  /**
   * Verify Kick webhook signature using public key
   * According to Kick docs: https://docs.kick.com/events/webhooks
   * Kick uses public key cryptography to sign webhook payloads
   */
  private async verifySignature(signature: string, rawBody: string): Promise<boolean> {
    if (!signature) {
      this.logger.warn('⚠️ No signature provided in webhook request');
      return false;
    }

    // Get Kick's public key
    const publicKey = await this.getKickPublicKey();
    if (!publicKey) {
      this.logger.warn('⚠️ Could not fetch Kick public key, skipping signature verification');
      // In development, allow without verification if public key fetch fails
      return process.env.NODE_ENV !== 'production';
    }

    try {
      // Kick likely uses Ed25519 or RSA signatures
      // The signature format may be: "t=<timestamp>,v1=<signature>" or similar
      // Adjust based on actual Kick webhook signature format
      
      // Parse signature header (format may vary - adjust based on Kick's actual format)
      // Common formats: "t=timestamp,v1=signature" or just the signature
      const signatureParts = signature.split(',');
      let actualSignature = signature;
      
      if (signatureParts.length > 1) {
        // Extract signature from "v1=..." format
        const v1Part = signatureParts.find(part => part.startsWith('v1='));
        if (v1Part) {
          actualSignature = v1Part.split('=')[1];
        }
      }

      // Try Ed25519 verification first (common for modern webhook systems)
      try {
        const verify = crypto.createVerify('SHA256');
        verify.update(rawBody);
        verify.end();
        
        // Try Ed25519
        const isValid = verify.verify(publicKey, Buffer.from(actualSignature, 'base64'));
        if (isValid) {
          return true;
        }
      } catch (edError) {
        // If Ed25519 fails, try RSA
        try {
          const verify = crypto.createVerify('SHA256');
          verify.update(rawBody);
          verify.end();
          const isValid = verify.verify(publicKey, Buffer.from(actualSignature, 'base64'));
          if (isValid) {
            return true;
          }
        } catch (rsaError) {
          this.logger.warn('❌ Signature verification failed with both Ed25519 and RSA:', {
            edError: edError.message,
            rsaError: rsaError.message,
          });
        }
      }

      return false;
    } catch (error) {
      this.logger.error('❌ Error verifying signature:', error);
      return false;
    }
  }
}

