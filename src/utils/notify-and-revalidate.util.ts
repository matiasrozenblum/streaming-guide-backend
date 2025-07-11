import fetch from 'node-fetch';
import { RedisService } from '../redis/redis.service';

interface NotifyAndRevalidateOptions {
  eventType: string;
  entity: string;
  entityId: string | number;
  payload?: any;
  revalidatePaths?: string[];
}

export class NotifyAndRevalidateUtil {
  constructor(
    private redisService: RedisService,
    private frontendUrl: string,
    private revalidateSecret: string,
  ) {}

  async notifyAndRevalidate(options: NotifyAndRevalidateOptions) {
    // 1. Broadcast SSE event
    const notification = {
      type: options.eventType,
      entity: options.entity,
      entityId: options.entityId,
      payload: options.payload || {},
      timestamp: Date.now(),
    };
    await this.redisService.set(
      `live_notification:${options.entity}:${options.entityId}:${Date.now()}`,
      JSON.stringify(notification),
      300 // 5 minutes TTL
    );

    // 2. Call Next.js revalidation endpoint for each path
    if (options.revalidatePaths && options.revalidatePaths.length > 0) {
      for (const path of options.revalidatePaths) {
        try {
          await fetch(`${this.frontendUrl}/api/revalidate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, secret: this.revalidateSecret }),
          });
        } catch (err) {
          console.error('Failed to revalidate path', path, err);
        }
      }
    }
  }
} 