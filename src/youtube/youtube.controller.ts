import { Controller, Get, Res, Sse } from '@nestjs/common';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { YoutubeLiveService } from './youtube-live.service';
import { RedisService } from '../redis/redis.service';

@Controller('youtube')
export class YoutubeController {
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
                subscriber.next({
                  data: JSON.stringify(notification),
                  type: 'message',
                } as MessageEvent);
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
} 