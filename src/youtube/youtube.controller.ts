import { Controller, Get, Res, Sse, Post, Body } from '@nestjs/common';
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
              const notificationString = await this.redisService.get(key);
              if (notificationString && typeof notificationString === 'string') {
                try {
                  const notification = JSON.parse(notificationString) as LiveNotification;
                  console.log('🔔 Processing SSE notification:', notification.type, notification.entity || notification.channelId);
                  
                  // Create a unique identifier for this notification
                  const notificationId = notification.channelId 
                    ? `${notification.type}:${notification.channelId}:${notification.timestamp}`
                    : `${notification.type}:${notification.entity}:${notification.entityId}:${notification.timestamp}`;
                  
                  // Only send if we haven't sent this notification before
                  if (!this.sentNotifications.has(notificationId)) {
                    console.log('📡 Notification not sent before, proceeding to send...');
                    this.sentNotifications.add(notificationId);
                    
                    console.log('📡 Sending SSE event to frontend:', notification);
                    subscriber.next({
                      data: JSON.stringify(notification),
                      type: 'message',
                    } as MessageEvent);
                    console.log('📡 SSE event sent successfully');
                    
                    // Clean up the notification from Redis after sending
                    await this.redisService.del(key);
                    
                    // Clean up the tracking set after 1 minute to prevent memory leaks
                    setTimeout(() => {
                      this.sentNotifications.delete(notificationId);
                    }, 60000);
                  } else {
                    console.log('📡 Notification already sent, skipping:', notificationId);
                  }
                } catch (error) {
                  console.error('Error parsing notification:', error);
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
      
      console.log(`🧪 Test notification sent for ${body.channelName}`);
      return { success: true, message: 'Test notification sent' };
    } catch (error) {
      console.error('Failed to send test notification:', error);
      return { success: false, error: error.message };
    }
  }

  // YouTube API usage endpoint removed - no longer needed
} 