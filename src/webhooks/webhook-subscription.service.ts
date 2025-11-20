import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class WebhookSubscriptionService {
  private readonly logger = new Logger(WebhookSubscriptionService.name);
  private readonly SUBSCRIPTION_PREFIX = 'webhook:subscription:';
  private readonly TWITCH_EVENTSUB_URL = 'https://api.twitch.tv/helix/eventsub/subscriptions';

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Subscribe to Twitch EventSub webhook for a streamer
   */
  async subscribeToTwitchEventSub(
    twitchUsername: string,
    eventType: 'stream.online' | 'stream.offline'
  ): Promise<string | null> {
    const clientId = this.configService.get<string>('TWITCH_CLIENT_ID');
    const clientSecret = this.configService.get<string>('TWITCH_CLIENT_SECRET');
    const webhookBaseUrl = this.configService.get<string>('WEBHOOK_BASE_URL') || process.env.WEBHOOK_BASE_URL;
    const accessToken = this.configService.get<string>('TWITCH_APP_ACCESS_TOKEN');

    if (!clientId || !clientSecret || !webhookBaseUrl) {
      this.logger.warn('⚠️ Twitch credentials or webhook URL not configured');
      return null;
    }

    try {
      // First, get the user ID from username
      const userResponse = await axios.get(
        `https://api.twitch.tv/helix/users?login=${twitchUsername}`,
        {
          headers: {
            'Client-ID': clientId,
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      const user = userResponse.data.data?.[0];
      if (!user) {
        this.logger.warn(`⚠️ Twitch user not found: ${twitchUsername}`);
        return null;
      }

      const userId = user.id;

      // Create EventSub subscription
      const subscriptionResponse = await axios.post(
        this.TWITCH_EVENTSUB_URL,
        {
          type: eventType,
          version: '1',
          condition: {
            broadcaster_user_id: userId,
          },
          transport: {
            method: 'webhook',
            callback: `${webhookBaseUrl}/webhooks/twitch`,
            secret: this.configService.get<string>('TWITCH_WEBHOOK_SECRET') || '',
          },
        },
        {
          headers: {
            'Client-ID': clientId,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const subscriptionId = subscriptionResponse.data.data?.[0]?.id;
      if (subscriptionId) {
        // Store subscription ID in Redis
        const key = `${this.SUBSCRIPTION_PREFIX}twitch:${twitchUsername}:${eventType}`;
        await this.redisService.set(key, { subscriptionId, username: twitchUsername, eventType }, 86400 * 365); // 1 year
        this.logger.log(`✅ Subscribed to Twitch EventSub: ${eventType} for ${twitchUsername} (subscription: ${subscriptionId})`);
        return subscriptionId;
      }

      return null;
    } catch (error: any) {
      this.logger.error(`❌ Error subscribing to Twitch EventSub: ${error.message}`, error.response?.data);
      return null;
    }
  }

  /**
   * Unsubscribe from Twitch EventSub webhook
   */
  async unsubscribeFromTwitchEventSub(subscriptionId: string): Promise<boolean> {
    const clientId = this.configService.get<string>('TWITCH_CLIENT_ID');
    const accessToken = this.configService.get<string>('TWITCH_APP_ACCESS_TOKEN');

    if (!clientId || !accessToken) {
      this.logger.warn('⚠️ Twitch credentials not configured');
      return false;
    }

    try {
      await axios.delete(
        `${this.TWITCH_EVENTSUB_URL}?id=${subscriptionId}`,
        {
          headers: {
            'Client-ID': clientId,
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      this.logger.log(`✅ Unsubscribed from Twitch EventSub: ${subscriptionId}`);
      return true;
    } catch (error: any) {
      this.logger.error(`❌ Error unsubscribing from Twitch EventSub: ${error.message}`, error.response?.data);
      return false;
    }
  }

  /**
   * Subscribe to Kick webhook for a streamer
   * According to Kick docs: https://docs.kick.com/events/subscribe-to-events
   * Uses app access token to subscribe to events for a specific channel
   */
  async subscribeToKickWebhook(kickUsername: string, userId?: number): Promise<string | null> {
    const clientId = this.configService.get<string>('KICK_CLIENT_ID');
    const clientSecret = this.configService.get<string>('KICK_CLIENT_SECRET');
    const appAccessToken = this.configService.get<string>('KICK_APP_ACCESS_TOKEN');
    const webhookBaseUrl = this.configService.get<string>('WEBHOOK_BASE_URL') || process.env.WEBHOOK_BASE_URL;

    if (!appAccessToken || !webhookBaseUrl) {
      this.logger.warn('⚠️ Kick app access token or webhook URL not configured');
      return null;
    }

    try {
      // If userId not provided, fetch it from Kick API using username
      let channelUserId = userId;
      if (!channelUserId) {
        // Fetch user ID from Kick API
        const userResponse = await axios.get(
          `https://kick.com/api/v2/channels/${kickUsername}`,
          {
            headers: {
              'Authorization': `Bearer ${appAccessToken}`,
            },
          }
        );

        channelUserId = userResponse.data?.user?.id || userResponse.data?.id;
        if (!channelUserId) {
          this.logger.warn(`⚠️ Could not find user ID for Kick username: ${kickUsername}`);
          return null;
        }
      }

      // Subscribe to livestream status events
      // According to Kick docs, use POST /api/v2/event-subscriptions
      const subscriptionResponse = await axios.post(
        'https://kick.com/api/v2/event-subscriptions',
        {
          event: 'livestream.status.updated', // Event type for live status changes
          user_id: channelUserId,
        },
        {
          headers: {
            'Authorization': `Bearer ${appAccessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const subscriptionId = subscriptionResponse.data?.id || subscriptionResponse.data?.subscription_id;
      if (subscriptionId) {
        // Store subscription ID in Redis
        const key = `${this.SUBSCRIPTION_PREFIX}kick:${kickUsername}`;
        await this.redisService.set(
          key,
          { subscriptionId, username: kickUsername, userId: channelUserId },
          86400 * 365 // 1 year
        );
        this.logger.log(`✅ Subscribed to Kick event for ${kickUsername} (user ID: ${channelUserId}, subscription: ${subscriptionId})`);
        return subscriptionId;
      }

      this.logger.warn(`⚠️ Kick subscription response missing subscription ID`);
      return null;
    } catch (error: any) {
      this.logger.error(`❌ Error subscribing to Kick event: ${error.message}`, error.response?.data);
      return null;
    }
  }

  /**
   * Unsubscribe from Kick webhook
   * According to Kick docs: https://docs.kick.com/events/subscribe-to-events
   */
  async unsubscribeFromKickWebhook(kickUsername: string): Promise<boolean> {
    const appAccessToken = this.configService.get<string>('KICK_APP_ACCESS_TOKEN');

    if (!appAccessToken) {
      this.logger.warn('⚠️ Kick app access token not configured');
      return false;
    }

    try {
      // Get subscription ID from Redis
      const key = `${this.SUBSCRIPTION_PREFIX}kick:${kickUsername}`;
      const subscription = await this.redisService.get(key) as any;
      
      if (!subscription || !subscription.subscriptionId) {
        this.logger.warn(`⚠️ No subscription found for Kick username: ${kickUsername}`);
        await this.redisService.del(key);
        return false;
      }

      // Delete subscription via Kick API
      // According to Kick docs, use DELETE /api/v2/event-subscriptions/{subscription_id}
      await axios.delete(
        `https://kick.com/api/v2/event-subscriptions/${subscription.subscriptionId}`,
        {
          headers: {
            'Authorization': `Bearer ${appAccessToken}`,
          },
        }
      );

      // Remove from Redis
      await this.redisService.del(key);
      this.logger.log(`✅ Unsubscribed from Kick event for ${kickUsername} (subscription: ${subscription.subscriptionId})`);
      return true;
    } catch (error: any) {
      this.logger.error(`❌ Error unsubscribing from Kick event: ${error.message}`, error.response?.data);
      // Still remove from Redis even if API call fails
      const key = `${this.SUBSCRIPTION_PREFIX}kick:${kickUsername}`;
      await this.redisService.del(key);
      return false;
    }
  }

  /**
   * Get all subscriptions for a streamer
   */
  async getSubscriptionsForStreamer(streamerId: number, services: Array<{ service: string; username?: string; url: string }>): Promise<{
    twitch: string[];
    kick: string[];
  }> {
    const subscriptions = {
      twitch: [] as string[],
      kick: [] as string[],
    };

    for (const service of services) {
      if (service.service === 'twitch') {
        const username = service.username || this.extractTwitchUsername(service.url);
        if (username) {
          // Check for both online and offline subscriptions
          const onlineKey = `${this.SUBSCRIPTION_PREFIX}twitch:${username}:stream.online`;
          const offlineKey = `${this.SUBSCRIPTION_PREFIX}twitch:${username}:stream.offline`;
          const onlineSub = await this.redisService.get(onlineKey);
          const offlineSub = await this.redisService.get(offlineKey);
          if (onlineSub) subscriptions.twitch.push((onlineSub as any).subscriptionId);
          if (offlineSub) subscriptions.twitch.push((offlineSub as any).subscriptionId);
        }
      } else if (service.service === 'kick') {
        const username = service.username || this.extractKickUsername(service.url);
        if (username) {
          const key = `${this.SUBSCRIPTION_PREFIX}kick:${username}`;
          const sub = await this.redisService.get(key);
          if (sub) subscriptions.kick.push((sub as any).subscriptionId || username);
        }
      }
    }

    return subscriptions;
  }

  private extractTwitchUsername(url: string): string | null {
    const match = url.match(/(?:twitch\.tv\/)([^/?]+)/);
    if (match && match[1] && match[1] !== 'videos' && match[1] !== 'directory') {
      return match[1];
    }
    return null;
  }

  private extractKickUsername(url: string): string | null {
    const match = url.match(/(?:kick\.com\/)([^/?]+)/);
    if (match && match[1]) {
      return match[1];
    }
    return null;
  }
}

