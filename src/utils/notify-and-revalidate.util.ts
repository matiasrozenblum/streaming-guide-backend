import { RedisService } from '../redis/redis.service';

interface NotifyAndRevalidateOptions {
  eventType: string;
  entity: string;
  entityId: string | number;
  payload?: any;
  revalidatePaths?: string[];
  revalidateTags?: string[];
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
      300, // 5 minutes TTL
    );

    // 2. Revalidate Next.js paths/tags in the background (non-blocking, fire-and-forget)
    if (options.revalidatePaths && options.revalidatePaths.length > 0) {
      this.revalidateInBackground({ paths: options.revalidatePaths });
    }
    if (options.revalidateTags && options.revalidateTags.length > 0) {
      this.revalidateInBackground({ tags: options.revalidateTags });
    }
  }

  private revalidateInBackground(opts: {
    paths?: string[];
    tags?: string[];
  }) {
    const bypassToken = this.vercelBypassSecret || this.revalidateSecret;
    const url = `${this.frontendUrl}/api/revalidate?x-vercel-set-bypass-cookie=true&x-vercel-protection-bypass=${bypassToken}`;

    const items = opts.paths
      ? opts.paths.map((path) => ({ path, secret: this.revalidateSecret }))
      : (opts.tags ?? []).map((tag) => ({ tag, secret: this.revalidateSecret }));

    // Fire all revalidation requests in parallel, don't await
    Promise.all(
      items.map(async (body) => {
        const label = 'path' in body ? `path: ${body.path}` : `tag: ${(body as any).tag}`;
        try {
          const response = await globalThis.fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-vercel-protection-bypass': bypassToken,
            },
            body: JSON.stringify(body),
          });

          if (!response.ok) {
            console.error(
              `[NotifyAndRevalidate] Failed to revalidate ${label}, status: ${response.status}`,
            );
          }
        } catch (err) {
          console.error(
            `[NotifyAndRevalidate] Failed to revalidate ${label}`,
            err,
          );
        }
      }),
    ).catch((err) => {
      console.error(
        '[NotifyAndRevalidate] Unexpected error in background revalidation',
        err,
      );
    });
  }
}
