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
   * Get Twitch EventSub subscriptions
   * According to Twitch API: https://dev.twitch.tv/docs/api/reference#get-eventsub-subscriptions
   */
  async getTwitchEventSubSubscriptions(
    status?: string,
    subscriptionId?: string
  ): Promise<any[]> {
    const clientId = this.configService.get<string>('TWITCH_CLIENT_ID');
    const accessToken = this.configService.get<string>('TWITCH_APP_ACCESS_TOKEN');

    if (!clientId || !accessToken) {
      this.logger.warn('⚠️ Twitch credentials not configured');
      return [];
    }

    try {
      const params: any = {};
      if (status) params.status = status;
      if (subscriptionId) params.id = subscriptionId;

      const response = await axios.get(this.TWITCH_EVENTSUB_URL, {
        params,
        headers: {
          'Client-ID': clientId,
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      return response.data.data || [];
    } catch (error: any) {
      this.logger.error(`❌ Error getting Twitch EventSub subscriptions: ${error.message}`, error.response?.data);
      return [];
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
        // Try public endpoint first (no auth required)
        // Kick's channels endpoint is typically public
        let userResponse;
        try {
          this.logger.log(`🔍 Fetching user ID for ${kickUsername} from public endpoint...`);
          userResponse = await axios.get(
            `https://kick.com/api/v2/channels/${kickUsername}`,
            {
              headers: {
                'User-Agent': 'StreamingGuide/1.0',
                'Accept': 'application/json',
              },
            }
          );
          this.logger.log(`✅ Successfully fetched user ID from public endpoint`);
        } catch (publicError: any) {
          // If public endpoint fails, try with authentication
          if (publicError.response?.status === 403 || publicError.response?.status === 401) {
            this.logger.log(`⚠️ Public endpoint blocked, trying with authentication...`);
            try {
              userResponse = await axios.get(
                `https://kick.com/api/v2/channels/${kickUsername}`,
                {
                  headers: {
                    'Authorization': `Bearer ${appAccessToken}`,
                    'User-Agent': 'StreamingGuide/1.0',
                    'Accept': 'application/json',
                  },
                }
              );
              this.logger.log(`✅ Successfully fetched user ID with authentication`);
            } catch (authError: any) {
              this.logger.error(`❌ Failed to fetch user ID with authentication:`, {
                status: authError.response?.status,
                statusText: authError.response?.statusText,
                data: authError.response?.data,
              });
              throw authError;
            }
          } else {
            throw publicError;
          }
        }

        // Kick API returns user_id at top level, not nested under user
        // Response structure: { id: channelId, user_id: userId, ... }
        channelUserId = userResponse.data?.user_id || userResponse.data?.user?.id || userResponse.data?.id;
        if (!channelUserId) {
          this.logger.warn(`⚠️ Could not find user ID for Kick username: ${kickUsername}`);
          this.logger.warn(`⚠️ Response data:`, JSON.stringify(userResponse.data, null, 2));
          return null;
        }
        
        this.logger.log(`✅ Found user ID ${channelUserId} for ${kickUsername}`);
      }

      // Subscribe to livestream status events
      // According to Kick API docs: https://docs.kick.com/events/subscribe-to-events
      // Endpoint: POST https://api.kick.com/public/v1/events/subscriptions
      // Webhook URL is configured in dashboard, not sent in API request
      const webhookUrl = `${webhookBaseUrl}/webhooks/kick`;
      this.logger.log(`🔔 Subscribing to Kick webhook for ${kickUsername} (user ID: ${channelUserId})`);
      this.logger.log(`🔑 Using app access token: ${appAccessToken ? appAccessToken.substring(0, 10) + '...' : 'MISSING'}`);
      this.logger.log(`📡 Webhook URL (configured in dashboard): ${webhookUrl}`);
      
      // Kick API format: { broadcaster_user_id, events: [{ name, version }], method: "webhook" }
      // Note: webhook_url is NOT in the request - it's configured in the dashboard
      // According to Kick docs: https://docs.kick.com/events/event-types
      // Event name: "livestream.status.updated" - fires when stream starts OR ends
      // Payload includes is_live: true (started) or is_live: false (ended)
      const subscriptionPayload = {
        broadcaster_user_id: channelUserId,
        events: [
          {
            name: 'livestream.status.updated', // Correct event name from Kick docs
            version: 1,
          },
        ],
        method: 'webhook',
      };
      
      this.logger.log(`📤 Subscription payload:`, JSON.stringify(subscriptionPayload, null, 2));
      
      // Correct endpoint: https://api.kick.com/public/v1/events/subscriptions
      const subscriptionResponse = await axios.post(
        'https://api.kick.com/public/v1/events/subscriptions',
        subscriptionPayload,
        {
          headers: {
            'Authorization': `Bearer ${appAccessToken}`,
            'Content-Type': 'application/json',
            'Accept': '*/*',
          },
        }
      );

      // Kick API response format: { data: [{ name, version, subscription_id, error? }], message }
      // Response is an array of results, one per event
      const responseData = subscriptionResponse.data?.data;
      if (responseData && Array.isArray(responseData) && responseData.length > 0) {
        const firstResult = responseData[0];
        
        if (firstResult.error) {
          this.logger.error(`❌ Kick subscription error: ${firstResult.error}`);
          return null;
        }
        
        const subscriptionId = firstResult.subscription_id;
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
      }

      this.logger.warn(`⚠️ Kick subscription response missing subscription ID`);
      this.logger.warn(`⚠️ Response data:`, JSON.stringify(subscriptionResponse.data, null, 2));
      return null;
    } catch (error: any) {
      this.logger.error(`❌ Error subscribing to Kick event for ${kickUsername}:`, {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        url: error.config?.url,
        payload: error.config?.data,
      });
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
      // According to Kick docs: DELETE https://api.kick.com/public/v1/events/subscriptions?id={subscription_id}
      await axios.delete(
        `https://api.kick.com/public/v1/events/subscriptions`,
        {
          params: {
            id: [subscription.subscriptionId], // Array of subscription IDs
          },
          headers: {
            'Authorization': `Bearer ${appAccessToken}`,
            'Accept': '*/*',
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

