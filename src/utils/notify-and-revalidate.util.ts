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
          console.log(`[NotifyAndRevalidate] Calling revalidate endpoint for path: ${path}`);
          console.log(`[NotifyAndRevalidate] Frontend URL: ${this.frontendUrl}`);
          console.log(`[NotifyAndRevalidate] Using secret: ${this.revalidateSecret.substring(0, 8)}...`);
          
          // Add Vercel bypass token to URL parameters
          const url = `${this.frontendUrl}/api/revalidate?x-vercel-set-bypass-cookie=true&x-vercel-protection-bypass=${this.revalidateSecret}`;
          console.log(`[NotifyAndRevalidate] Full URL: ${url}`);
          
          const response = await globalThis.fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, secret: this.revalidateSecret }),
          });
          
          const responseBody = await response.text();
          console.log(`[NotifyAndRevalidate] Revalidate response for path ${path}:`, response.status, responseBody);
          
          if (response.ok) {
            console.log(`[NotifyAndRevalidate] ✅ Successfully revalidated path: ${path}`);
          } else {
            console.log(`[NotifyAndRevalidate] ❌ Failed to revalidate path: ${path}, status: ${response.status}`);
          }
        } catch (err) {
          console.error('[NotifyAndRevalidate] Failed to revalidate path', path, err);
        }
      }
    }
  }
} 