import { Controller, Get, Res, Sse, Post, Body, Logger } from '@nestjs/common';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { YoutubeLiveService } from './youtube-live.service';
import { RedisService } from '../redis/redis.service';

interface LiveNotification {
  type: string;
  channelId?: string;
  videoId?: string;
  channelName?: string;
  timestamp: number;
  entity?: string;
  entityId?: string | number;
  payload?: any;
}

@Controller('youtube')
export class YoutubeController {
  private readonly logger = new Logger(YoutubeController.name);
  private sentNotifications = new Set<string>(); // Track sent notifications

  constructor(
    private readonly youtubeLiveService: YoutubeLiveService,
    private readonly redisService: RedisService,
  ) { }

  @Sse('live-events')
  liveEvents(): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      // Send initial connection message
      subscriber.next({
        data: JSON.stringify({ type: 'connected', timestamp: Date.now() }),
        type: 'message',
      } as MessageEvent);

      // Heartbeat to keep connection alive indefinitely on Railway load balancers
      const heartbeatInterval = setInterval(() => {
        subscriber.next({
          data: JSON.stringify({ type: 'ping', timestamp: Date.now() }),
          type: 'message',
        } as MessageEvent);
      }, 30000);

      // Set up polling for live status changes
      const interval = setInterval(async () => {
        try {
          // Check for recent live notifications (last 60 seconds to give more time)
          const sixtySecondsAgo = Date.now() - 60000;
          const keys = await this.redisService.client.keys('live_notification:*');

          for (const key of keys) {
            const parts = key.split(':');
            const timestamp = parseInt(parts[parts.length - 1]);

            if (isNaN(timestamp)) {
              this.logger.warn(`Invalid timestamp in notification key: ${key}`);
              continue;
            }

            if (timestamp > sixtySecondsAgo) {
              const notificationString = await this.redisService.get(key);
              if (notificationString && typeof notificationString === 'string') {
                try {
                  const notification = JSON.parse(notificationString) as LiveNotification;

                  // Create a unique identifier for this notification
                  const notificationId = notification.channelId
                    ? `${notification.type}:${notification.channelId}:${notification.timestamp}`
                    : `${notification.type}:${notification.entity}:${notification.entityId}:${notification.timestamp}`;

                  // Only send if we haven't sent this notification before (per-connection)
                  if (!this.sentNotifications.has(notificationId)) {
                    this.sentNotifications.add(notificationId);

                    subscriber.next({
                      data: JSON.stringify(notification),
                      type: 'message',
                    } as MessageEvent);

                    // IMPORTANT: Do NOT delete the Redis key here.
                    // We want ALL connected clients to receive the notification.
                    // Each connection tracks what it has already sent via sentNotifications.
                    // Old notifications are cleaned up below (timestamp check) or by TTL.

                    // Clean up the tracking set after 1 minute to prevent memory leaks
                    setTimeout(() => {
                      this.sentNotifications.delete(notificationId);
                    }, 60000);
                  }
                } catch (error) {
                  this.logger.error('Error parsing notification:', error);
                }
              }
            } else {
              // Clean up old notifications
              await this.redisService.del(key);
            }
          }
        } catch (error) {
          this.logger.error('Error in live events SSE polling:', error);
        }
      }, 2000); // Check every 2 seconds

      // Cleanup on disconnect
      return () => {
        clearInterval(interval);
        clearInterval(heartbeatInterval);
      };
    });
  }

  @Post('test-live-notification')
  async testLiveNotification(@Body() body: { channelId: string; channelName: string; videoId?: string }) {
    try {
      // Manually trigger a live status notification for testing
      const notification = {
        type: 'live_status_changed',  // Fixed: frontend expects 'live_status_changed' not 'live_status_change'
        channelId: body.channelId,
        videoId: body.videoId || 'test_video_id_123',
        channelName: body.channelName,
        timestamp: Date.now(),
      };

      await this.redisService.set(
        `live_notification:${body.channelId}:${Date.now()}`,
        JSON.stringify(notification),
        300 // 5 minutes TTL
      );

      this.logger.debug(`🧪 Test notification sent for ${body.channelName}`);
      return { success: true, message: 'Test notification sent' };
    } catch (error) {
      this.logger.error('Failed to send test notification:', error);
      return { success: false, error: error.message };
    }
  }

  // YouTube API usage endpoint removed - no longer needed
} 