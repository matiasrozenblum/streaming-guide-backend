import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Streamer } from './streamers.entity';
import { CreateStreamerDto } from './dto/create-streamer.dto';
import { UpdateStreamerDto } from './dto/update-streamer.dto';
import { RedisService } from '@/redis/redis.service';
import { Category } from '../categories/categories.entity';
import { NotifyAndRevalidateUtil } from '../utils/notify-and-revalidate.util';
import { ConfigService } from '@/config/config.service';
import { StreamerLiveStatusService } from './streamer-live-status.service';
import { WebhookSubscriptionService } from '../webhooks/webhook-subscription.service';
import { extractTwitchUsername, extractKickUsername } from './utils/extract-streamer-username';
import { generateServiceUrl } from './utils/generate-service-url';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://staging.laguiadelstreaming.com';
const REVALIDATE_SECRET = process.env.REVALIDATE_SECRET || 'changeme';

@Injectable()
export class StreamersService {
  private notifyUtil: NotifyAndRevalidateUtil;
  private readonly CACHE_KEY = 'streamers:visible';
  private readonly CACHE_TTL = 3600; // 1 hour

  constructor(
    @InjectRepository(Streamer)
    private readonly streamersRepository: Repository<Streamer>,
    @InjectRepository(Category)
    private readonly categoriesRepository: Repository<Category>,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly streamerLiveStatusService: StreamerLiveStatusService,
    private readonly webhookSubscriptionService: WebhookSubscriptionService,
  ) {
    this.notifyUtil = new NotifyAndRevalidateUtil(
      this.redisService,
      FRONTEND_URL,
      REVALIDATE_SECRET
    );
  }

  async findAll(): Promise<Streamer[]> {
    return this.streamersRepository.find({
      relations: ['categories'],
      order: {
        order: 'ASC',
      },
    });
  }

  async findAllVisible(): Promise<Streamer[]> {
    // Try cache first
    const cached = await this.redisService.get<Streamer[]>(this.CACHE_KEY);
    if (cached) {
      return cached;
    }

    // Fetch from database
    const streamers = await this.streamersRepository.find({
      where: { is_visible: true },
      relations: ['categories'],
      order: {
        order: 'ASC',
      },
    });

    // Cache the result
    await this.redisService.set(this.CACHE_KEY, streamers, this.CACHE_TTL);

    return streamers;
  }

  /**
   * Get visible streamers with live status included
   */
  async findAllVisibleWithLiveStatus(): Promise<Array<Streamer & { is_live?: boolean }>> {
    const streamers = await this.findAllVisible();
    const streamerIds = streamers.map(s => s.id);

    // Get live statuses for all streamers
    const liveStatuses = await this.streamerLiveStatusService.getLiveStatuses(streamerIds);

    // Merge live status into streamers
    return streamers.map(streamer => {
      const liveStatus = liveStatuses.get(streamer.id);
      return {
        ...streamer,
        is_live: liveStatus?.isLive || false,
      };
    });
  }

  async findOne(id: number): Promise<Streamer> {
    const streamer = await this.streamersRepository.findOne({
      where: { id },
      relations: ['categories']
    });
    if (!streamer) {
      throw new NotFoundException(`Streamer with ID ${id} not found`);
    }
    return streamer;
  }

  async create(createStreamerDto: CreateStreamerDto): Promise<Streamer> {
    const { category_ids, ...streamerData } = createStreamerDto;

    // Auto-generate URLs for Twitch/Kick services if username is provided but URL is not
    const processedServices = streamerData.services.map(service => {
      if ((service.service === 'twitch' || service.service === 'kick') && service.username && !service.url) {
        return {
          ...service,
          url: generateServiceUrl(service.service, service.username),
        };
      }
      // If URL is provided but no username, extract username from URL (backward compatibility)
      if ((service.service === 'twitch' || service.service === 'kick') && service.url && !service.username) {
        const extractedUsername = service.service === 'twitch'
          ? extractTwitchUsername(service.url)
          : extractKickUsername(service.url);
        if (extractedUsername) {
          return {
            ...service,
            username: extractedUsername,
          };
        }
      }
      return service;
    });

    // Determine next order (append to end)
    const lastStreamer = await this.streamersRepository
      .createQueryBuilder('streamer')
      .where('streamer.order IS NOT NULL')
      .orderBy('streamer.order', 'DESC')
      .getOne();
    const newOrder = lastStreamer ? ((lastStreamer.order as number) || 0) + 1 : 1;

    const streamer = this.streamersRepository.create({
      ...streamerData,
      services: processedServices,
      is_visible: streamerData.is_visible ?? true,
      order: newOrder,
    });

    // Load categories if provided
    if (category_ids && category_ids.length > 0) {
      const categories = await this.categoriesRepository.findBy({ id: In(category_ids) });
      streamer.categories = categories;
    }

    // Clear cache
    try {
      await this.redisService.del(this.CACHE_KEY);
    } catch (error) {
      console.error('❌ Error clearing streamers cache:', error.message);
    }

    const saved = await this.streamersRepository.save(streamer);

    // Initialize live status cache
    await this.streamerLiveStatusService.initializeCache(saved.id, saved.services);

    // Subscribe to webhooks for Twitch and Kick services
    await this.subscribeToWebhooks(saved);

    // Notify and revalidate
    await this.notifyUtil.notifyAndRevalidate({
      eventType: 'streamer_created',
      entity: 'streamer',
      entityId: saved.id,
      payload: { streamer: saved },
      revalidatePaths: ['/streamers'],
    });

    return saved;
  }

  async reorder(streamerIds: number[]): Promise<void> {
    // Update order in a transaction
    await this.streamersRepository.manager.transaction(async (manager) => {
      for (let i = 0; i < streamerIds.length; i++) {
        await manager.update(Streamer, streamerIds[i], { order: i + 1 });
      }
    });

    // Clear cache
    try {
      await this.redisService.del(this.CACHE_KEY);
    } catch (error) {
      console.error('❌ Error clearing streamers cache:', (error as any).message);
    }

    // Notify and revalidate
    await this.notifyUtil.notifyAndRevalidate({
      eventType: 'streamers_reordered',
      entity: 'streamer',
      entityId: 'all',
      payload: { streamerIds },
      revalidatePaths: ['/streamers'],
    });
  }

  async update(id: number, updateStreamerDto: UpdateStreamerDto): Promise<Streamer> {
    const streamer = await this.findOne(id);

    // Store old services to compare later
    const oldServices = JSON.parse(JSON.stringify(streamer.services));

    const { category_ids, ...streamerData } = updateStreamerDto;

    // Auto-generate URLs for Twitch/Kick services if username is provided but URL is not
    if (streamerData.services) {
      const processedServices = streamerData.services.map(service => {
        if ((service.service === 'twitch' || service.service === 'kick') && service.username && !service.url) {
          return {
            ...service,
            url: generateServiceUrl(service.service, service.username),
          };
        }
        // If URL is provided but no username, extract username from URL (backward compatibility)
        if ((service.service === 'twitch' || service.service === 'kick') && service.url && !service.username) {
          const extractedUsername = service.service === 'twitch'
            ? extractTwitchUsername(service.url)
            : extractKickUsername(service.url);
          if (extractedUsername) {
            return {
              ...service,
              username: extractedUsername,
            };
          }
        }
        return service;
      });
      streamerData.services = processedServices;
    }

    // Update streamer fields
    Object.assign(streamer, streamerData);

    // Update categories if provided
    if (category_ids !== undefined) {
      if (category_ids.length > 0) {
        const categories = await this.categoriesRepository.findBy({ id: In(category_ids) });
        streamer.categories = categories;
      } else {
        streamer.categories = [];
      }
    }

    // Clear cache
    try {
      await this.redisService.del(this.CACHE_KEY);
    } catch (error) {
      console.error('❌ Error clearing streamers cache:', error.message);
    }

    const saved = await this.streamersRepository.save(streamer);

    // Check if services changed (username, service type, or service added/removed)
    const servicesChanged = JSON.stringify(oldServices) !== JSON.stringify(saved.services);

    if (servicesChanged) {
      // Unsubscribe from old webhooks first (to avoid orphaned subscriptions)
      const oldStreamer = { ...streamer, services: oldServices };
      await this.unsubscribeFromWebhooks(oldStreamer);

      // Update live status cache with new services
      await this.streamerLiveStatusService.initializeCache(saved.id, saved.services);

      // Subscribe to new webhooks
      await this.subscribeToWebhooks(saved);
    } else {
      // Services didn't change, just update cache if needed
      await this.streamerLiveStatusService.initializeCache(saved.id, saved.services);
    }

    // Notify and revalidate
    await this.notifyUtil.notifyAndRevalidate({
      eventType: 'streamer_updated',
      entity: 'streamer',
      entityId: saved.id,
      payload: { streamer: saved },
      revalidatePaths: ['/streamers'],
    });

    return saved;
  }

  async remove(id: number): Promise<void> {
    const streamer = await this.findOne(id);

    // Unsubscribe from webhooks
    await this.unsubscribeFromWebhooks(streamer);

    // Clear live status cache
    await this.streamerLiveStatusService.clearLiveStatus(id);

    // Clear cache
    try {
      await this.redisService.del(this.CACHE_KEY);
    } catch (error) {
      console.error('❌ Error clearing streamers cache:', error.message);
    }

    await this.streamersRepository.remove(streamer);

    // Notify and revalidate
    await this.notifyUtil.notifyAndRevalidate({
      eventType: 'streamer_deleted',
      entity: 'streamer',
      entityId: id,
      payload: { streamerId: id },
      revalidatePaths: ['/streamers'],
    });
  }

  /**
   * Subscribe to webhooks for streamer's services
   */
  private async subscribeToWebhooks(streamer: Streamer): Promise<void> {
    console.log(`🔔 Starting webhook subscription for streamer ${streamer.id} (${streamer.name})`);
    const kickServices = streamer.services.filter(s => s.service === 'kick');
    const twitchServices = streamer.services.filter(s => s.service === 'twitch');

    if (kickServices.length > 0) {
      console.log(`   Found ${kickServices.length} Kick service(s)`);
    }
    if (twitchServices.length > 0) {
      console.log(`   Found ${twitchServices.length} Twitch service(s)`);
    }

    for (const service of streamer.services) {
      if (service.service === 'twitch') {
        const username = service.username || extractTwitchUsername(service.url);
        if (username) {
          // Subscribe to both online and offline events
          await this.webhookSubscriptionService.subscribeToTwitchEventSub(username, 'stream.online');
          await this.webhookSubscriptionService.subscribeToTwitchEventSub(username, 'stream.offline');
        }
      } else if (service.service === 'kick') {
        const username = service.username || extractKickUsername(service.url);
        if (username) {
          // Use userId from service if available, otherwise fetch from API
          await this.webhookSubscriptionService.subscribeToKickWebhook(username, service.userId);
        }
      }
    }

    console.log(`✅ Completed webhook subscription for streamer ${streamer.id}`);
  }

  /**
   * Unsubscribe from webhooks for streamer's services
   */
  private async unsubscribeFromWebhooks(streamer: Streamer): Promise<void> {
    const subscriptions = await this.webhookSubscriptionService.getSubscriptionsForStreamer(
      streamer.id,
      streamer.services
    );

    // Unsubscribe from Twitch
    for (const subscriptionId of subscriptions.twitch) {
      await this.webhookSubscriptionService.unsubscribeFromTwitchEventSub(subscriptionId);
    }

    // Unsubscribe from Kick
    for (const subscriptionId of subscriptions.kick) {
      if (subscriptionId !== 'pending') {
        // Only unsubscribe if it's a real subscription ID
        const username = streamer.services.find(s => s.service === 'kick')?.username ||
          extractKickUsername(streamer.services.find(s => s.service === 'kick')?.url || '');
        if (username) {
          await this.webhookSubscriptionService.unsubscribeFromKickWebhook(username);
        }
      }
    }
  }

  /**
   * Re-subscribe to webhooks for a streamer
   * Useful for fixing broken subscriptions or updating webhook URLs
   */
  async resubscribeWebhooks(streamerId: number): Promise<{ success: boolean; message: string }> {
    const streamer = await this.findOne(streamerId);

    // Unsubscribe from old webhooks first
    await this.unsubscribeFromWebhooks(streamer);

    // Re-subscribe to webhooks
    await this.subscribeToWebhooks(streamer);

    return {
      success: true,
      message: `Successfully re-subscribed to webhooks for streamer ${streamer.name}`,
    };
  }

  /**
   * Get webhook subscription status for a streamer
   * Checks both Redis cache and Twitch/Kick APIs to verify subscriptions are active
   */
  async getWebhookStatus(streamerId: number): Promise<{
    streamer: { id: number; name: string };
    twitch: Array<{ username: string; eventType: string; subscriptionId: string; status: string; fromApi: boolean }>;
    kick: Array<{ username: string; subscriptionId: string; status: string; fromApi: boolean }>;
  }> {
    const streamer = await this.findOne(streamerId);
    const status = {
      streamer: { id: streamer.id, name: streamer.name },
      twitch: [] as Array<{ username: string; eventType: string; subscriptionId: string; status: string; fromApi: boolean }>,
      kick: [] as Array<{ username: string; subscriptionId: string; status: string; fromApi: boolean }>,
    };

    // Get subscriptions from Redis
    const redisSubscriptions = await this.webhookSubscriptionService.getSubscriptionsForStreamer(
      streamerId,
      streamer.services
    );

    // For Twitch: Check status from API
    for (const service of streamer.services) {
      if (service.service === 'twitch') {
        const username = service.username || extractTwitchUsername(service.url);
        if (username) {
          // Get subscriptions from Twitch API
          const apiSubscriptions = await this.webhookSubscriptionService.getTwitchEventSubSubscriptions();

          // Check for both online and offline subscriptions
          for (const eventType of ['stream.online', 'stream.offline'] as const) {
            const redisKey = `webhook:subscription:twitch:${username}:${eventType}`;
            const redisSub = await this.redisService.get(redisKey) as any;
            const subscriptionId = redisSub?.subscriptionId;

            if (subscriptionId) {
              // Find matching subscription in API response
              const apiSub = apiSubscriptions.find(
                (s: any) => s.id === subscriptionId && s.type === eventType
              );

              status.twitch.push({
                username,
                eventType,
                subscriptionId,
                status: apiSub?.status || 'unknown',
                fromApi: !!apiSub,
              });
            }
          }
        }
      } else if (service.service === 'kick') {
        const username = service.username || extractKickUsername(service.url);
        if (username) {
          const redisKey = `webhook:subscription:kick:${username}`;
          const redisSub = await this.redisService.get(redisKey) as any;
          const subscriptionId = redisSub?.subscriptionId;

          if (subscriptionId) {
            // Kick doesn't have a public API to check subscription status
            // So we just report what we have in Redis
            status.kick.push({
              username,
              subscriptionId,
              status: 'unknown', // Kick API doesn't provide status endpoint
              fromApi: false,
            });
          }
        }
      }
    }

    return status;
  }

  /**
   * Sync live status from external APIs (Kick/Twitch) for a streamer
   * Useful when webhooks miss events or streamer is already live when subscription is created
   */
  async syncLiveStatus(streamerId: number): Promise<{
    streamer: { id: number; name: string };
    results: Array<{ service: string; username: string; success: boolean; isLive: boolean; error?: string }>;
  }> {
    const streamer = await this.findOne(streamerId);
    const results: Array<{ service: string; username: string; success: boolean; isLive: boolean; error?: string }> = [];

    for (const service of streamer.services) {
      if (service.service === 'kick') {
        const username = service.username || extractKickUsername(service.url);
        if (username) {
          const result = await this.streamerLiveStatusService.syncLiveStatusFromKick(streamerId, username);
          results.push({
            service: 'kick',
            username,
            ...result,
          });
        }
      }
      // TODO: Add Twitch sync when needed
    }

    // Notify frontend if any status changed
    if (results.some(r => r.success)) {
      await this.notifyUtil.notifyAndRevalidate({
        eventType: 'live_status_synced',
        entity: 'streamer',
        entityId: streamerId,
        payload: {
          streamerId,
          streamerName: streamer.name,
          results,
        },
        revalidatePaths: ['/streamers'],
      });
    }

    return {
      streamer: { id: streamer.id, name: streamer.name },
      results,
    };
  }
}

