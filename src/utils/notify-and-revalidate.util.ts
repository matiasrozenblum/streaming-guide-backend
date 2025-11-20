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
    private vercelBypassSecret?: string,
  ) {}

  async notifyAndRevalidate(options: NotifyAndRevalidateOptions) {
    // 1. Broadcast SSE event
    const timestamp = Date.now();
    const notification = {
      type: options.eventType,
      entity: options.entity,
      entityId: options.entityId,
      payload: options.payload || {},
      timestamp,
    };
    const notificationKey = `live_notification:${options.entity}:${options.entityId}:${timestamp}`;
    console.log(`[NotifyAndRevalidate] Storing notification in Redis: ${notificationKey}`, JSON.stringify(notification));
    await this.redisService.set(
      notificationKey,
      JSON.stringify(notification),
      300 // 5 minutes TTL
    );
    console.log(`[NotifyAndRevalidate] ✅ Notification stored in Redis: ${notificationKey}`);

    // 2. Call Next.js revalidation endpoint for each path
    if (options.revalidatePaths && options.revalidatePaths.length > 0) {
      for (const path of options.revalidatePaths) {
        try {
          console.log(`[NotifyAndRevalidate] Calling revalidate endpoint for path: ${path}`);
          console.log(`[NotifyAndRevalidate] Frontend URL: ${this.frontendUrl}`);
          console.log(`[NotifyAndRevalidate] Using secret: ${this.revalidateSecret.substring(0, 8)}...`);
          console.log(`[NotifyAndRevalidate] Using Vercel bypass secret: ${this.vercelBypassSecret ? this.vercelBypassSecret.substring(0, 8) + '...' : 'undefined'}`);
          
          // Use Vercel bypass secret for URL parameters if available, otherwise fall back to revalidate secret
          const bypassToken = this.vercelBypassSecret || this.revalidateSecret;
          const url = `${this.frontendUrl}/api/revalidate?x-vercel-set-bypass-cookie=true&x-vercel-protection-bypass=${bypassToken}`;
          console.log(`[NotifyAndRevalidate] Full URL: ${url}`);
          
          const response = await globalThis.fetch(url, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'x-vercel-protection-bypass': bypassToken,
            },
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