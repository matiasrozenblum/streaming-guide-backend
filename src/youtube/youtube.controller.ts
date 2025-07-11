import { Controller, Get, Res, Sse, Post, Body } from '@nestjs/common';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { YoutubeLiveService } from './youtube-live.service';
import { RedisService } from '../redis/redis.service';

@Controller('youtube')
export class YoutubeController {
  private sentNotifications = new Set<string>(); // Track sent notifications

  constructor(
    private readonly youtubeLiveService: YoutubeLiveService,
    private readonly redisService: RedisService,
  ) {}

  @Sse('live-events')
  liveEvents(): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      // Send initial connection message
      subscriber.next({
        data: JSON.stringify({ type: 'connected', timestamp: Date.now() }),
        type: 'message',
      } as MessageEvent);

      // Set up polling for live status changes
      const interval = setInterval(async () => {
        try {
          // Check for recent live notifications (last 30 seconds)
          const thirtySecondsAgo = Date.now() - 30000;
          const keys = await this.redisService.client.keys('live_notification:*');
          
          for (const key of keys) {
            const parts = key.split(':');
            const timestamp = parseInt(parts[parts.length - 1]);
            
            if (timestamp > thirtySecondsAgo) {
              const notification = await this.redisService.get(key);
              if (notification) {
                // Create a unique identifier for this notification
                const notificationId = `${notification.entity}:${notification.entityId}:${notification.timestamp}`;
                
                // Only send if we haven't sent this notification before
                if (!this.sentNotifications.has(notificationId)) {
                  this.sentNotifications.add(notificationId);
                  
                  subscriber.next({
                    data: JSON.stringify(notification),
                    type: 'message',
                  } as MessageEvent);
                  
                  // Clean up the notification from Redis after sending
                  await this.redisService.del(key);
                  
                  // Clean up the tracking set after 1 minute to prevent memory leaks
                  setTimeout(() => {
                    this.sentNotifications.delete(notificationId);
                  }, 60000);
                }
              }
            }
          }
        } catch (error) {
          console.error('Error in live events SSE:', error);
        }
      }, 5000); // Check every 5 seconds

      // Cleanup on disconnect
      return () => {
        clearInterval(interval);
      };
    });
  }

  @Post('test-live-notification')
  async testLiveNotification(@Body() body: { channelId: string; channelName: string; videoId?: string }) {
    try {
      // Manually trigger a live status notification for testing
      const notification = {
        type: 'live_status_change',
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
      
      console.log(`🧪 Test notification sent for ${body.channelName}`);
      return { success: true, message: 'Test notification sent' };
    } catch (error) {
      console.error('Failed to send test notification:', error);
      return { success: false, error: error.message };
    }
  }
} 