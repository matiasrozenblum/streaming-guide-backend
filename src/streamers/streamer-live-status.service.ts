import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@/redis/redis.service';
import { StreamerLiveStatusCache, StreamerServiceStatus } from './interfaces/streamer-live-status-cache.interface';
import { StreamerService } from './streamers.entity';

@Injectable()
export class StreamerLiveStatusService {
  private readonly logger = new Logger(StreamerLiveStatusService.name);
  private readonly CACHE_PREFIX = 'streamer:live-status:';
  private readonly DEFAULT_TTL = 3600; // 1 hour

  constructor(private readonly redisService: RedisService) {}

  /**
   * Update live status for a specific streamer and service
   */
  async updateLiveStatus(
    streamerId: number,
    service: 'twitch' | 'kick' | 'youtube',
    isLive: boolean,
    username?: string
  ): Promise<void> {
    const cacheKey = `${this.CACHE_PREFIX}${streamerId}`;
    const existing = await this.redisService.get<StreamerLiveStatusCache>(cacheKey);

    const now = Date.now();
    const serviceStatus: StreamerServiceStatus = {
      service,
      isLive,
      lastUpdated: now,
      username,
    };

    let updatedCache: StreamerLiveStatusCache;

    if (existing) {
      // Update existing cache
      const existingServiceIndex = existing.services.findIndex(s => s.service === service);
      
      if (existingServiceIndex >= 0) {
        // Update existing service status
        existing.services[existingServiceIndex] = serviceStatus;
      } else {
        // Add new service status
        existing.services.push(serviceStatus);
      }

      // Recalculate overall isLive (true if ANY service is live)
      const overallIsLive = existing.services.some(s => s.isLive);

      updatedCache = {
        streamerId: existing.streamerId,
        isLive: overallIsLive,
        services: existing.services,
        lastUpdated: now,
        ttl: existing.ttl,
      };
    } else {
      // Create new cache entry
      updatedCache = {
        streamerId,
        isLive,
        services: [serviceStatus],
        lastUpdated: now,
        ttl: this.DEFAULT_TTL,
      };
    }

    await this.redisService.set(cacheKey, updatedCache, updatedCache.ttl);
    this.logger.debug(`✅ Updated live status for streamer ${streamerId}, service ${service}: isLive=${isLive}`);
  }

  /**
   * Get live status for a specific streamer
   */
  async getLiveStatus(streamerId: number): Promise<StreamerLiveStatusCache | null> {
    const cacheKey = `${this.CACHE_PREFIX}${streamerId}`;
    return await this.redisService.get<StreamerLiveStatusCache>(cacheKey);
  }

  /**
   * Get live status for multiple streamers
   */
  async getLiveStatuses(streamerIds: number[]): Promise<Map<number, StreamerLiveStatusCache>> {
    const result = new Map<number, StreamerLiveStatusCache>();
    
    // Fetch all in parallel
    const promises = streamerIds.map(async (id) => {
      const status = await this.getLiveStatus(id);
      if (status) {
        result.set(id, status);
      }
    });

    await Promise.all(promises);
    return result;
  }

  /**
   * Get all streamers' live status (for frontend)
   * Returns a map of streamerId -> isLive
   */
  async getAllLiveStatuses(): Promise<Map<number, boolean>> {
    // This is a simplified version - in production, you might want to scan Redis
    // For now, we'll rely on individual lookups when needed
    // This method can be enhanced if we need to fetch all at once
    return new Map();
  }

  /**
   * Clear live status cache for a streamer
   */
  async clearLiveStatus(streamerId: number): Promise<void> {
    const cacheKey = `${this.CACHE_PREFIX}${streamerId}`;
    await this.redisService.del(cacheKey);
    this.logger.debug(`🗑️ Cleared live status cache for streamer ${streamerId}`);
  }

  /**
   * Initialize cache for a streamer based on their services
   * Called when streamer is created/updated
   */
  async initializeCache(streamerId: number, services: StreamerService[]): Promise<void> {
    const cacheKey = `${this.CACHE_PREFIX}${streamerId}`;
    const now = Date.now();

    const serviceStatuses: StreamerServiceStatus[] = services.map(service => ({
      service: service.service,
      isLive: false, // Initially offline
      lastUpdated: now,
      username: service.username,
    }));

    const cache: StreamerLiveStatusCache = {
      streamerId,
      isLive: false,
      services: serviceStatuses,
      lastUpdated: now,
      ttl: this.DEFAULT_TTL,
    };

    await this.redisService.set(cacheKey, cache, cache.ttl);
    this.logger.debug(`📝 Initialized live status cache for streamer ${streamerId}`);
  }
}

