import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@/redis/redis.service';
import { StreamerLiveStatusCache, StreamerServiceStatus } from './interfaces/streamer-live-status-cache.interface';
import { StreamerService } from './streamers.entity';

@Injectable()
export class StreamerLiveStatusService {
  private readonly logger = new Logger(StreamerLiveStatusService.name);
  private readonly CACHE_PREFIX = 'streamer:live-status:';
  // TTL: 7 days (604800 seconds) - cache persists until webhook updates it
  // This is a safety net in case webhooks fail; normally webhooks will update/clear the cache
  private readonly DEFAULT_TTL = 604800; // 7 days

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
        ttl: this.DEFAULT_TTL, // Refresh TTL on webhook update to ensure cache persists
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
   * Preserves existing live status if cache already exists
   */
  async initializeCache(streamerId: number, services: StreamerService[]): Promise<void> {
    const cacheKey = `${this.CACHE_PREFIX}${streamerId}`;
    const existing = await this.redisService.get<StreamerLiveStatusCache>(cacheKey);
    const now = Date.now();

    // If cache exists, preserve existing live status for services that still exist
    if (existing) {
      const updatedServices: StreamerServiceStatus[] = services.map(service => {
        // Find existing status for this service
        const existingService = existing.services.find(s => s.service === service.service);
        
        if (existingService) {
          // Preserve existing live status
          return {
            ...existingService,
            username: service.username || existingService.username, // Update username if changed
          };
        } else {
          // New service, initialize as offline
          return {
            service: service.service,
            isLive: false,
            lastUpdated: now,
            username: service.username,
          };
        }
      });

      // Recalculate overall isLive
      const overallIsLive = updatedServices.some(s => s.isLive);

      const updatedCache: StreamerLiveStatusCache = {
        streamerId,
        isLive: overallIsLive,
        services: updatedServices,
        lastUpdated: existing.lastUpdated, // Preserve original lastUpdated
        ttl: this.DEFAULT_TTL, // Use new TTL to ensure cache persists
      };

      await this.redisService.set(cacheKey, updatedCache, updatedCache.ttl);
      this.logger.debug(`📝 Updated live status cache for streamer ${streamerId} (preserved existing status)`);
    } else {
      // No existing cache, initialize as offline
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
}

