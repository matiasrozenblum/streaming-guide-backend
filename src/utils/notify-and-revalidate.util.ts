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
    // 1. Broadcast SSE event (fast, awaited)
    const timestamp = Date.now();
    const notification = {
      type: options.eventType,
      entity: options.entity,
      entityId: options.entityId,
      payload: options.payload || {},
      timestamp,
    };
    const notificationKey = `live_notification:${options.entity}:${options.entityId}:${timestamp}`;
    await this.redisService.set(
      notificationKey,
      JSON.stringify(notification),
      300 // 5 minutes TTL
    );

    // 2. Revalidate Next.js paths in the background (non-blocking, fire-and-forget)
    if (options.revalidatePaths && options.revalidatePaths.length > 0) {
      this.revalidateInBackground(options.revalidatePaths);
    }
  }

  private revalidateInBackground(paths: string[]) {
    const bypassToken = this.vercelBypassSecret || this.revalidateSecret;
    const url = `${this.frontendUrl}/api/revalidate?x-vercel-set-bypass-cookie=true&x-vercel-protection-bypass=${bypassToken}`;

    // Fire all revalidation requests in parallel, don't await
    Promise.all(
      paths.map(async (path) => {
        try {
          const response = await globalThis.fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-vercel-protection-bypass': bypassToken,
            },
            body: JSON.stringify({ path, secret: this.revalidateSecret }),
          });

          if (!response.ok) {
            console.error(`[NotifyAndRevalidate] Failed to revalidate path: ${path}, status: ${response.status}`);
          }
        } catch (err) {
          console.error('[NotifyAndRevalidate] Failed to revalidate path', path, err);
        }
      }),
    ).catch((err) => {
      console.error('[NotifyAndRevalidate] Unexpected error in background revalidation', err);
    });
  }
} 