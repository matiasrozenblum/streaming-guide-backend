import { Controller, Post, Get, Req, Res, Logger, Headers, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { StreamerLiveStatusService } from '../streamers/streamer-live-status.service';
import { StreamersService } from '../streamers/streamers.service';
import { NotifyAndRevalidateUtil } from '../utils/notify-and-revalidate.util';
import { RedisService } from '../redis/redis.service';
import { extractTwitchUsername } from '../streamers/utils/extract-streamer-username';
import * as crypto from 'crypto';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://staging.laguiadelstreaming.com';
const REVALIDATE_SECRET = process.env.REVALIDATE_SECRET || 'changeme';
const TWITCH_WEBHOOK_SECRET = process.env.TWITCH_WEBHOOK_SECRET || '';

interface TwitchEventSubNotification {
  subscription: {
    id: string;
    status: string;
    type: string;
    version: string;
  };
  event?: {
    broadcaster_user_id: string;
    broadcaster_user_login: string;
    broadcaster_user_name: string;
    type: string;
    started_at?: string;
    ended_at?: string;
  };
  challenge?: string;
}

@Controller('webhooks/twitch')
export class TwitchWebhookController {
  private readonly logger = new Logger(TwitchWebhookController.name);
  private notifyUtil: NotifyAndRevalidateUtil;

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
   * Handle EventSub webhook verification (GET request with challenge)
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async verifyWebhook(@Req() req: Request, @Res() res: Response) {
    const mode = req.query['hub.mode'] as string;
    const challenge = req.query['hub.challenge'] as string;
    const topic = req.query['hub.topic'] as string;

    this.logger.log(`🔔 Twitch webhook verification request: mode=${mode}, topic=${topic}`);

    if (mode === 'subscribe' && challenge) {
      // Return challenge to verify webhook
      this.logger.log(`✅ Twitch webhook verified, returning challenge`);
      return res.status(200).send(challenge);
    }

    return res.status(400).send('Invalid verification request');
  }

  /**
   * Handle EventSub webhook notifications (POST request with events)
   * According to Twitch docs: https://dev.twitch.tv/docs/eventsub/handling-webhook-events
   * IMPORTANT: Verify signature FIRST before handling any message type
   */
  @Post()
  async handleWebhook(
    @Headers('twitch-eventsub-message-signature') signature: string,
    @Headers('twitch-eventsub-message-id') messageId: string,
    @Headers('twitch-eventsub-message-timestamp') timestamp: string,
    @Headers('twitch-eventsub-message-type') messageType: string,
    @Body() body: TwitchEventSubNotification,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const notification = body;

    // Check message type from header (not from subscription.status)
    // According to docs: Twitch-Eventsub-Message-Type header contains the notification type
    const normalizedMessageType = messageType?.toLowerCase();

    // Handle webhook_callback_verification FIRST (before signature verification)
    // According to docs: https://dev.twitch.tv/docs/eventsub/handling-webhook-events/#responding-to-a-challenge-request
    // Verification requests are signed, but we handle them first to return the challenge immediately
    if (normalizedMessageType === 'webhook_callback_verification') {
      const challenge = notification.challenge;
      if (challenge) {
        // Get raw body for signature verification
        const rawBody = (req as any).rawBody || JSON.stringify(body);
        
        // Verify signature for verification requests too (Twitch signs them)
        if (!this.verifySignature(signature, messageId, timestamp, rawBody)) {
          this.logger.warn('❌ Invalid Twitch webhook signature for verification request');
          return res.status(403).send('Invalid signature');
        }
        
        this.logger.log(`✅ Twitch webhook callback verification received, returning challenge: ${challenge.substring(0, 20)}...`);
        // Response must contain the raw challenge string only
        // Set Content-Type to text/plain and return 200
        return res.set('Content-Type', 'text/plain').status(200).send(challenge);
      } else {
        this.logger.warn('⚠️ Verification request missing challenge');
        return res.status(400).send('Missing challenge');
      }
    }

    // For all other requests (notifications, revocations), verify signature
    // According to Twitch docs: "Before handling any message, you must make sure that Twitch sent it"
    const rawBody = (req as any).rawBody || JSON.stringify(body);
    if (!this.verifySignature(signature, messageId, timestamp, rawBody)) {
      this.logger.warn('❌ Invalid Twitch webhook signature');
      return res.status(403).send('Invalid signature');
    }

    // Handle revocation
    if (normalizedMessageType === 'revocation') {
      this.logger.warn(`⚠️ Twitch subscription revoked: ${notification.subscription.id}, reason: ${notification.subscription.status}`);
      // Must return 2XX status code for revocation
      return res.status(204).send();
    }

    // Handle notification (actual events)
    if (normalizedMessageType === 'notification' && notification.subscription.status === 'enabled') {
      if (notification.event) {
        await this.handleEvent(notification);
      }
      // Return 204 No Content for successful event processing
      return res.status(204).send();
    }

    // Unknown message type - return 204 anyway
    this.logger.warn(`⚠️ Unknown message type: ${messageType}`);
    return res.status(204).send();
  }

  /**
   * Verify Twitch EventSub webhook signature
   */
  private verifySignature(
    signature: string,
    messageId: string,
    timestamp: string,
    rawBody: string
  ): boolean {
    if (!TWITCH_WEBHOOK_SECRET) {
      this.logger.warn('⚠️ TWITCH_WEBHOOK_SECRET not configured, skipping signature verification');
      return true; // Allow in development
    }

    // Allow bypassing signature verification for testing (when signature starts with "test-")
    if (signature?.startsWith('test-')) {
      this.logger.warn('⚠️ Test signature detected, skipping verification');
      return true;
    }

    if (!signature || !messageId || !timestamp) {
      return false;
    }

    // Reconstruct the message (Twitch uses messageId + timestamp + rawBody)
    const message = messageId + timestamp + rawBody;

    // Calculate expected signature
    const hmac = crypto.createHmac('sha256', TWITCH_WEBHOOK_SECRET);
    hmac.update(message);
    const expectedSignature = 'sha256=' + hmac.digest('hex');

    // Check if signature format matches (must start with 'sha256=')
    if (!signature.startsWith('sha256=')) {
      this.logger.warn('❌ Invalid signature format: must start with "sha256="');
      return false;
    }

    // Check lengths before comparison (timingSafeEqual requires equal lengths)
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);
    
    if (signatureBuffer.length !== expectedBuffer.length) {
      this.logger.warn(`❌ Signature length mismatch: received ${signatureBuffer.length}, expected ${expectedBuffer.length}`);
      return false;
    }

    // Compare signatures (constant-time comparison)
    try {
      return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
    } catch (error) {
      this.logger.warn('❌ Error comparing signatures:', error);
      return false;
    }
  }

  /**
   * Handle Twitch EventSub events
   */
  private async handleEvent(notification: TwitchEventSubNotification): Promise<void> {
    const event = notification.event;
    if (!event) return;

    const username = event.broadcaster_user_login;
    const eventType = notification.subscription.type;

    this.logger.log(`📡 Twitch webhook event: ${eventType} for ${username}`);

    // Find streamer by Twitch username
    const streamers = await this.streamersService.findAll();
    const streamer = streamers.find(s => {
      const twitchService = s.services.find(service => service.service === 'twitch');
      if (!twitchService) return false;
      const streamerUsername = twitchService.username || extractTwitchUsername(twitchService.url);
      return streamerUsername?.toLowerCase() === username.toLowerCase();
    });

    if (!streamer) {
      this.logger.warn(`⚠️ Streamer not found for Twitch username: ${username}`);
      return;
    }

    // Determine if live based on event type
    let isLive = false;
    if (eventType === 'stream.online') {
      isLive = true;
    } else if (eventType === 'stream.offline') {
      isLive = false;
    }

    // Update live status
    await this.streamerLiveStatusService.updateLiveStatus(
      streamer.id,
      'twitch',
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
        service: 'twitch',
        isLive,
      },
      revalidatePaths: ['/streamers'],
    });

    this.logger.log(`✅ Updated live status for streamer ${streamer.id} (${streamer.name}): isLive=${isLive}`);
  }
}

