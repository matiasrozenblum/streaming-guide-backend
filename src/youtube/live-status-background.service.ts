import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { YoutubeLiveService } from './youtube-live.service';
import { SchedulesService } from '../schedules/schedules.service';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '../config/config.service';
import { SentryService } from '../sentry/sentry.service';
import { TimezoneUtil } from '../utils/timezone.util';
import { Channel } from '../channels/channels.entity';
import { getCurrentBlockTTL } from '../utils/getBlockTTL.util';

interface LiveStream {
  videoId: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  publishedAt?: string;
}

interface LiveStatusCache {
  channelId: string;
  handle: string;
  isLive: boolean;
  streamUrl: string | null;
  videoId: string | null;
  lastUpdated: number;
  ttl: number;
  // Block-aware fields for accurate timing
  blockEndTime: number; // When the current block ends (in minutes)
  validationCooldown: number; // When we can validate again (timestamp)
  lastValidation: number; // Last time we validated the video ID
  // Stream details (unified cache - replaces liveStreamsByChannel)
  streams: LiveStream[];
  streamCount: number;
}

@Injectable()
export class LiveStatusBackgroundService {
  private readonly logger = new Logger(LiveStatusBackgroundService.name);
  private readonly CACHE_PREFIX = 'liveStatusByHandle:'; // Migration complete
  private readonly CACHE_TTL = 5 * 60; // 5 minutes default TTL

  constructor(
    private readonly youtubeLiveService: YoutubeLiveService,
    private readonly schedulesService: SchedulesService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly sentryService: SentryService,
    @InjectRepository(Channel)
    private readonly channelsRepository: Repository<Channel>,
  ) {}

  /**
   * Background job that runs every 2 minutes to pre-fetch live status
   * This ensures live status is always cached and ready for fast API responses
   */
  @Cron('*/2 * * * *') // Every 2 minutes
  async updateLiveStatusBackground() {
    const startTime = Date.now();
    
    // Distributed lock to prevent multiple replicas from running simultaneously
    const lockKey = 'cron:live-status-background:lock';
    const lockTTL = 90; // 90 seconds (less than 2-minute cron interval)
    
    const acquired = await this.redisService.setNX(lockKey, { timestamp: Date.now() }, lockTTL);
    
    if (!acquired) {
      this.logger.log('⏸️  Skipping background update - another replica is already running');
      return;
    }
    
    this.logger.log('🔄 Starting background live status update (lock acquired)');

    try {
      const currentDay = TimezoneUtil.currentDayOfWeek();
      const currentTime = TimezoneUtil.currentTimeInMinutes();

      // Get schedules with weekly overrides applied (includes virtual/special programs)
      // This is crucial for detecting special programs from weekly overrides
      const allSchedules = await this.schedulesService.findAll({
        dayOfWeek: currentDay,
        liveStatus: false, // Don't need live status, just schedule data
        applyOverrides: true, // ✅ CRITICAL: Apply weekly overrides to include special programs
      });

      const channelsToUpdate: string[] = [];
      const liveChannels = new Map<string, { channelId: string; handle: string }>();

      // Find channels with programs running right now (including special programs)
      for (const schedule of allSchedules) {
        const channelId = schedule.program?.channel?.youtube_channel_id;
        const handle = schedule.program?.channel?.handle;
        
        if (!channelId || !handle) continue;

        // Check if this schedule is currently live
        const startNum = this.convertTimeToNumber(schedule.start_time);
        const endNum = this.convertTimeToNumber(schedule.end_time);
        const isLive = currentTime >= startNum && currentTime < endNum;

        if (isLive) {
          liveChannels.set(channelId, { channelId, handle });
        }
      }

      // Check which channels need cache updates
      for (const [channelId, channelInfo] of liveChannels) {
        this.logger.debug(`[LIVE-STATUS-BG] Checking cache for channel ${channelInfo.handle} (${channelId})`);
        const cached = await this.getCachedLiveStatus(channelInfo.handle);
        
        if (!cached || await this.shouldUpdateCache(cached)) {
          this.logger.debug(`[LIVE-STATUS-BG] Cache update needed for channel ${channelInfo.handle} (${channelId})`);
          channelsToUpdate.push(channelId);
        }
      }

      this.logger.log(`📊 Found ${liveChannels.size} channels with live programs, ${channelsToUpdate.length} needing update`);

      if (channelsToUpdate.length === 0) {
        this.logger.log('✅ All channels up to date, skipping update');
        return;
      }

      // Update live status for channels in batches
      await this.updateChannelsInBatches(channelsToUpdate);

      // Update unified enriched cache with fresh live status
      await this.updateLiveStatusForAllChannels();

      const duration = Date.now() - startTime;
      this.logger.log(`✅ Background live status update completed in ${duration}ms`);

    } catch (error) {
      this.logger.error('❌ Error in background live status update:', error);
    }
  }

  /**
   * Get cached live status for a channel (fast, non-blocking)
   * Migration complete - only uses handle-based format
   */
  async getCachedLiveStatus(handle?: string): Promise<LiveStatusCache | null> {
    if (!handle) {
      return null;
    }
    
    const cacheKey = `${this.CACHE_PREFIX}${handle}`;
    const cache = await this.redisService.get<LiveStatusCache>(cacheKey);
    if (cache) {
      this.logger.debug(`[LIVE-STATUS-BG] Cache hit for ${handle}`);
      return cache;
    }
    
    return null;
  }

  /**
   * Get live status for multiple channels (uses background cache when available)
   * Migration complete - now accepts handles instead of channelIds
   * 
   * Uses unified cache (liveStatusByHandle) - no longer uses liveStreamsByChannel
   * 
   * @param handles Array of channel handles to get status for
   * @param handleToChannelId Optional map of handle -> channelId for accurate sync
   */
  async getLiveStatusForChannels(handles: string[], handleToChannelId?: Map<string, string>): Promise<Map<string, LiveStatusCache>> {
    const results = new Map<string, LiveStatusCache>();
    const handlesNeedingUpdate: string[] = [];

    // Check cache first
    for (const handle of handles) {
      const cached = await this.getCachedLiveStatus(handle);
      if (cached) {
        const needsUpdate = await this.shouldUpdateCache(cached);
        if (!needsUpdate) {
          // Cache is fresh, use it
          results.set(handle, cached);
        } else {
          // Cache exists but is stale
          // CRITICAL: Still return stale cache instead of nothing to prevent excessive async fetches
          // The background cron will update it, but we don't want every request triggering fetches
          // Only return empty if cache is truly missing or extremely old (>30 minutes)
          const age = Date.now() - cached.lastUpdated;
          const ageMinutes = age / (60 * 1000);
          
          if (ageMinutes < 30) {
            // Return stale cache - better than triggering expensive API calls
            // Background cron (runs every 2 min) will refresh it soon
            this.logger.debug(`[LIVE-STATUS-BG] Returning stale cache for ${handle} (${Math.round(ageMinutes)}min old) to prevent async fetch`);
            results.set(handle, cached);
          } else {
            // Cache is very old (>30 min) - don't return it, let async fetch happen
            this.logger.debug(`[LIVE-STATUS-BG] Cache for ${handle} too old (${Math.round(ageMinutes)}min), not returning to allow refresh`);
            handlesNeedingUpdate.push(handle);
          }
        }
      } else {
        // liveStatusByHandle missing
        // Note: liveStreamsByChannel no longer exists - everything uses liveStatusByHandle
        handlesNeedingUpdate.push(handle);
      }
    }

    // Note: updateChannelsInBatches expects channelIds, so we can't use it here
    // For now, return cached results (including stale ones <30min old). Fresh updates are handled by the background cron.

    return results;
  }

  /**
   * Update channels in batches to avoid API rate limits
   */
  private async updateChannelsInBatches(channelIds: string[]): Promise<Map<string, LiveStatusCache>> {
    const results = new Map<string, LiveStatusCache>();
    const batchSize = 10; // Process 10 channels at a time

    for (let i = 0; i < channelIds.length; i += batchSize) {
      this.logger.debug(`[LIVE-STATUS-BG] Updating channel ${channelIds[i]}`);
      const batch = channelIds.slice(i, i + batchSize);
      this.logger.log(`🔄 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(channelIds.length / batchSize)}: ${batch.length} channels`);

      // Process batch in parallel
      const batchPromises = batch.map(channelId => this.updateChannelLiveStatus(channelId));
      const batchResults = await Promise.allSettled(batchPromises);

      // Collect successful results
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          results.set(batch[index], result.value);
        }
      });

      // Small delay between batches to be respectful to YouTube API
      if (i + batchSize < channelIds.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  /**
   * Update live status for a single channel
   */
  private async updateChannelLiveStatus(channelId: string): Promise<LiveStatusCache | null> {
    try {
      // Get current day and time
      const currentDay = TimezoneUtil.currentDayOfWeek();
      const currentTime = TimezoneUtil.currentTimeInMinutes();
      
      // Get schedules with weekly overrides applied (includes virtual/special programs)
      const allSchedules = await this.schedulesService.findAll({
        dayOfWeek: currentDay,
        liveStatus: false,
        applyOverrides: true, // ✅ Include special programs from weekly overrides
      });

      // Find ALL schedules for this channel today (not just live ones)
      const channelSchedules = allSchedules.filter(schedule => {
        const scheduleChannelId = schedule.program?.channel?.youtube_channel_id;
        return scheduleChannelId === channelId;
      });

      if (channelSchedules.length === 0) {
        // Channel has no schedules today (unusual - caller should have checked this)
        return null;
      }

      // Get channel handle from the first schedule
      const handle = channelSchedules[0].program.channel.handle;
      if (!handle) {
        return null;
      }

      // Check if channel is enabled for live fetching
      try {
        if (!(await this.configService.canFetchLive(handle))) {
          return null;
        }
      } catch (error) {
        // If we can't check the config (e.g., database connection issue), log and skip
        this.logger.error(`❌ Error checking fetch config for ${handle}: with error ${error.message}`, error.message);
        return null;
      }

      // Now filter for currently live schedules
      const liveSchedules = channelSchedules.filter(schedule => {
        const startNum = this.convertTimeToNumber(schedule.start_time);
        const endNum = this.convertTimeToNumber(schedule.end_time);
        return currentTime >= startNum && currentTime < endNum;
      });

      // If no live schedules, cache as not live (program ended)
      if (liveSchedules.length === 0) {
        const cacheData: LiveStatusCache = {
          channelId,
          handle,
          isLive: false,
          streamUrl: null,
          videoId: null,
          lastUpdated: Date.now(),
          ttl: 5 * 60, // 5 minutes
          blockEndTime: 24 * 60, // End of day
          validationCooldown: Date.now() + (30 * 60 * 1000),
          lastValidation: Date.now(),
          // Unified stream data
          streams: [],
          streamCount: 0,
        };
        await this.cacheLiveStatus(channelId, cacheData);
        return cacheData;
      }

      // Calculate TTL using block TTL logic for accurate timing
      // ✅ CRITICAL: Use channelSchedules (from allSchedules with overrides) instead of findByDay
      // findByDay doesn't include weekly overrides, which is why futurock's cache was failing
      const ttl = await getCurrentBlockTTL(channelId, channelSchedules, this.sentryService);
      
      // Calculate block end time for cache metadata
      const blockEndTime = this.calculateBlockEndTime(liveSchedules, currentTime);

      // Check unified cache (liveStatusByHandle replaces liveStreamsByChannel)
      const statusCacheKey = `${this.CACHE_PREFIX}${handle}`;
      const cachedStatus = await this.redisService.get<LiveStatusCache>(statusCacheKey);
      
      // CRITICAL: Detect program block transitions
      // If blockEndTime changed, it means we've transitioned between programs (old program ended, new one started)
      // This ensures we refresh cache on program transitions, not just when TTL expires
      const programBlockChanged = cachedStatus && cachedStatus.blockEndTime && cachedStatus.blockEndTime !== blockEndTime;
      if (programBlockChanged) {
        this.logger.debug(`[LIVE-STATUS-BG] Program block changed for ${handle}: blockEndTime ${cachedStatus.blockEndTime} → ${blockEndTime}, invalidating cache`);
        await this.redisService.del(statusCacheKey);
        // Continue to fetch fresh data below
      }
      
      if (cachedStatus && cachedStatus.videoId && !programBlockChanged) {
        // We have cached status - check if we need to validate using video age
        // Only validate if video is >30 minutes old (to avoid excessive API calls)
        // CRITICAL: Use video age (lastValidation) instead of validationCooldown timestamp
        const videoAge = Date.now() - cachedStatus.lastValidation;
        const videoAgeMinutes = videoAge / (60 * 1000);
        const needsValidation = videoAgeMinutes > 30;
        
        if (needsValidation) {
          // Validation needed - video is >30 minutes old, check if it's still live
          // Use videos API (cheaper than search) to validate
          this.logger.debug(`[LIVE-STATUS-BG] Video ID ${cachedStatus.videoId} is ${Math.round(videoAgeMinutes)}min old, validating if still live for ${handle}`);
          const isStillLive = await this.youtubeLiveService.isVideoLive(cachedStatus.videoId);
          if (isStillLive) {
            // Video is still live, update cache with current schedules metadata
            this.logger.debug(`[LIVE-STATUS-BG] Video ID ${cachedStatus.videoId} still live for ${handle}`);
            // Update TTL and blockEndTime from current schedules, update lastValidation time
            cachedStatus.ttl = ttl;
            cachedStatus.blockEndTime = blockEndTime;
            cachedStatus.lastValidation = Date.now(); // Reset validation time - won't validate again for 30 min
            cachedStatus.lastUpdated = Date.now();
            await this.cacheLiveStatus(channelId, cachedStatus);
            return cachedStatus;
          } else {
            // Video is no longer live - check if program is still scheduled before triggering expensive search API
            // If program ended, don't waste API quota searching for new streams
            const hasLiveSchedules = liveSchedules.length > 0;
            
            if (hasLiveSchedules) {
              // Program still scheduled, video might have rotated - fetch new one
              this.logger.debug(`[LIVE-STATUS-BG] Video ID ${cachedStatus.videoId} no longer live for ${handle}, but program still scheduled - fetching new one`);
              await this.redisService.del(statusCacheKey);
            } else {
              // Program ended, don't waste API quota - just mark as not live
              this.logger.debug(`[LIVE-STATUS-BG] Video ID ${cachedStatus.videoId} no longer live for ${handle}, and program ended - marking as not live`);
              const notLiveData = this.createNotLiveCacheData(channelId, handle, ttl);
              await this.cacheLiveStatus(channelId, notLiveData);
              return notLiveData;
            }
          }
        } else {
          // Validation not needed - video is fresh (<30 minutes old), just update metadata (TTL, blockEndTime) from current schedules
          this.logger.debug(`[LIVE-STATUS-BG] Using cached video ID ${cachedStatus.videoId} for ${handle} (fresh video, ${Math.round(videoAgeMinutes)}min old, updating metadata)`);
          // Update TTL and blockEndTime from current schedules, preserve cooldown
          cachedStatus.ttl = ttl;
          cachedStatus.blockEndTime = blockEndTime;
          cachedStatus.lastUpdated = Date.now();
          await this.cacheLiveStatus(channelId, cachedStatus);
          return cachedStatus;
        }
      }
      
      // No cached video ID or validation failed, check not-found cache
      const notFoundKey = `videoIdNotFound:${handle}`;
      const notFoundData = await this.redisService.get<string>(notFoundKey);
      
      if (notFoundData) {
        // Channel is marked as not-found, skip fetching
        this.logger.debug(`[LIVE-STATUS-BG] Skipping ${handle} - marked as not-found`);
        return this.createNotLiveCacheData(channelId, handle, ttl);
      }
      
      // Fetch live streams from YouTube using main cron method (should extend not-found marks)
      this.logger.debug(`[LIVE-STATUS-BG] Fetching live streams for ${handle} (${channelId})`);
      const liveStreams = await this.youtubeLiveService.getLiveStreamsMain(
        channelId,
        handle,
        ttl
      );
      this.logger.debug(`[LIVE-STATUS-BG] Live streams result for ${handle}:`, liveStreams);

      const cacheData: LiveStatusCache = {
        channelId,
        handle,
        isLive: liveStreams !== null && liveStreams !== '__SKIPPED__' && liveStreams.streams.length > 0,
        streamUrl: liveStreams && liveStreams !== '__SKIPPED__' && liveStreams.streams.length > 0 
          ? `https://www.youtube.com/embed/${liveStreams.primaryVideoId}?autoplay=1`
          : null,
        videoId: liveStreams && liveStreams !== '__SKIPPED__' ? liveStreams.primaryVideoId : null,
        lastUpdated: Date.now(),
        ttl,
        blockEndTime,
        validationCooldown: Date.now() + (30 * 60 * 1000), // Can validate again in 30 minutes
        lastValidation: Date.now(),
        // Unified stream data
        streams: liveStreams && liveStreams !== '__SKIPPED__' ? liveStreams.streams : [],
        streamCount: liveStreams && liveStreams !== '__SKIPPED__' ? liveStreams.streamCount : 0,
      };

      this.logger.debug(`[LIVE-STATUS-BG] Cache data for ${handle}:`, cacheData);

      await this.cacheLiveStatus(channelId, cacheData);
      return cacheData;

    } catch (error) {
      this.logger.error(`❌ Error updating live status for channel ${channelId}:`, error);
      return null;
    }
  }

  /**
   * Cache live status data
   * Migration complete - only uses handle-based format
   */
  private async cacheLiveStatus(channelId: string, data: LiveStatusCache): Promise<void> {
    if (!data.handle) {
      return;
    }
    
    const cacheKey = `${this.CACHE_PREFIX}${data.handle}`;
    await this.redisService.set(cacheKey, data, data.ttl);
    this.logger.debug(`✅ Live status cache updated for ${data.handle}`);
    this.logger.log(`✅ Live status cache updated for channel ${data.handle} (${channelId}): isLive=${data.isLive}, streams=${data.streamCount}`);
  }

  /**
   * Check if cache should be updated
   * Considers TTL and program block changes - validation is done separately in updateChannelLiveStatus to avoid excessive API calls
   * 
   * IMPORTANT: Returns false (cache is valid) for slightly stale cache to prevent excessive async fetches
   * The background cron will handle updates, and we don't want every request triggering fetches
   */
  private async shouldUpdateCache(cached: LiveStatusCache): Promise<boolean> {
    const now = Date.now();
    const age = now - cached.lastUpdated;
    
    // Always update if TTL has expired
    if (age > cached.ttl * 1000) {
      return true;
    }
    
    // CRITICAL: Cache with blockEndTime=1440 means no program was live when cache was created
    // This is suspicious if the channel now has live programs - force a refresh to check
    if (cached.blockEndTime === 1440 && cached.isLive) {
      this.logger.debug(`[LIVE-STATUS-BG] Suspicious cache: blockEndTime=1440 but isLive=true, forcing refresh`);
      return true;
    }
    
    // CRITICAL: Detect program block changes by checking if we're past the cached blockEndTime
    // If blockEndTime is in the past, the program that was live when cache was created has ended
    // This ensures cache refreshes when programs transition, even if TTL hasn't fully expired
    if (cached.blockEndTime && cached.blockEndTime !== 1440) {
      const currentTimeInMinutes = this.convertTimeToMinutes(now);
      if (currentTimeInMinutes >= cached.blockEndTime) {
        this.logger.debug(`[LIVE-STATUS-BG] Cache blockEndTime (${cached.blockEndTime}) has passed (current: ${currentTimeInMinutes}), program ended - forcing refresh`);
        return true;
      }
    }
    
    // DO NOT validate here - it causes excessive API calls
    // Validation will happen in updateChannelLiveStatus when actually updating the cache
    // This prevents cascading API calls during the initial check phase
    
    // IMPORTANT: Only mark as needing update when 90% of TTL has passed (was 80%)
    // This gives more margin before triggering async fetches, relying on background cron for updates
    // This reduces the window where optimized-schedules triggers unnecessary fetches
    return age > cached.ttl * 1000 * 0.9;
  }
  
  /**
   * Convert current timestamp to minutes since midnight (Argentina timezone)
   * Uses TimezoneUtil for consistency with schedule calculations
   */
  private convertTimeToMinutes(timestamp: number): number {
    const timeInArgentina = TimezoneUtil.toArgentinaTime(new Date(timestamp));
    return timeInArgentina.hour() * 60 + timeInArgentina.minute();
  }

  /**
   * Calculate block end time for cache metadata
   * Uses the same logic as getCurrentBlockTTL but returns the end time in minutes
   */
  private calculateBlockEndTime(schedules: any[], currentTime: number): number {
    // Sort schedules by start time
    const sortedSchedules = schedules
      .map(s => ({
        start: this.convertTimeToNumber(s.start_time),
        end: this.convertTimeToNumber(s.end_time),
      }))
      .sort((a, b) => a.start - b.start);

    // Find the current block end time
    let blockEnd: number | null = null;
    let prevEnd: number | null = null;
    
    for (const schedule of sortedSchedules) {
      if (schedule.start <= currentTime && schedule.end > currentTime) {
        // Start block with this schedule
        prevEnd = schedule.end;
        blockEnd = schedule.end;
        continue;
      }
      if (prevEnd !== null && schedule.start - prevEnd < 2) {
        // Extend block (gap < 2 minutes)
        blockEnd = schedule.end;
        prevEnd = schedule.end;
        continue;
      }
      // If block already detected and can't extend, break
      if (blockEnd !== null) break;
    }
    
    return blockEnd || (24 * 60); // Fallback to end of day
  }

  /**
   * Convert time string to minutes
   */
  private convertTimeToNumber(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  /**
   * Create cache data from existing streams
   */
  private createCacheDataFromStreams(
    channelId: string, 
    handle: string, 
    streams: any, 
    ttl: number, 
    blockEndTime: number
  ): LiveStatusCache {
    return {
      channelId,
      handle,
      isLive: streams.streams && streams.streams.length > 0,
      streamUrl: streams.streams && streams.streams.length > 0 
        ? `https://www.youtube.com/embed/${streams.primaryVideoId}?autoplay=1`
        : null,
      videoId: streams.primaryVideoId || null,
      lastUpdated: Date.now(),
      ttl,
      blockEndTime,
      validationCooldown: Date.now() + (30 * 60 * 1000),
      lastValidation: Date.now(),
      streams: streams.streams || [],
      streamCount: streams.streamCount || 0,
    };
  }

  /**
   * Create cache data for not-live channels
   */
  private createNotLiveCacheData(channelId: string, handle: string, ttl: number): LiveStatusCache {
    return {
      channelId,
      handle,
      isLive: false,
      streamUrl: null,
      videoId: null,
      lastUpdated: Date.now(),
      ttl,
      blockEndTime: 24 * 60, // End of day
      validationCooldown: Date.now() + (30 * 60 * 1000),
      lastValidation: Date.now(),
      streams: [],
      streamCount: 0,
    };
  }

  /**
   * Update live status for channels that actually have live programs
   * This method should NOT update all channels - only those with live programs
   */
  private async updateLiveStatusForAllChannels(): Promise<void> {
    try {
      this.logger.log('[LIVE-STATUS-UPDATE] Skipping bulk update - only updating channels with live programs');
      
      // This method was causing excessive API calls by updating ALL channels
      // Instead, we only update channels that have live programs (handled in main loop)
      // No action needed here - the main updateLiveStatusBackground method handles this correctly
      
    } catch (error) {
      this.logger.error('[LIVE-STATUS-UPDATE] Error in live status update:', error);
    }
  }
}
