import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { YoutubeLiveService } from './youtube-live.service';
import { SchedulesService } from '../schedules/schedules.service';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '../config/config.service';
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
  // Stream details (unified with liveStreamsByChannel)
  streams: LiveStream[];
  streamCount: number;
}

@Injectable()
export class LiveStatusBackgroundService {
  private readonly logger = new Logger(LiveStatusBackgroundService.name);
  private readonly CACHE_PREFIX = 'liveStatus:';
  private readonly CACHE_TTL = 5 * 60; // 5 minutes default TTL

  constructor(
    private readonly youtubeLiveService: YoutubeLiveService,
    private readonly schedulesService: SchedulesService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
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
    this.logger.log('🔄 Starting background live status update');

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
        const cacheKey = `${this.CACHE_PREFIX}${channelId}`;
        const cached = await this.redisService.get<LiveStatusCache>(cacheKey);
        
        if (!cached || await this.shouldUpdateCache(cached)) {
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
   */
  async getCachedLiveStatus(channelId: string): Promise<LiveStatusCache | null> {
    const cacheKey = `${this.CACHE_PREFIX}${channelId}`;
    return await this.redisService.get<LiveStatusCache>(cacheKey);
  }

  /**
   * Get live status for multiple channels (uses background cache when available)
   */
  async getLiveStatusForChannels(channelIds: string[]): Promise<Map<string, LiveStatusCache>> {
    const results = new Map<string, LiveStatusCache>();
    const channelsNeedingUpdate: string[] = [];

    // Check cache first
    for (const channelId of channelIds) {
      const cached = await this.getCachedLiveStatus(channelId);
      if (cached && !(await this.shouldUpdateCache(cached))) {
        results.set(channelId, cached);
      } else {
        channelsNeedingUpdate.push(channelId);
      }
    }

    // Update channels that need fresh data
    if (channelsNeedingUpdate.length > 0) {
      const freshData = await this.updateChannelsInBatches(channelsNeedingUpdate);
      for (const [channelId, data] of freshData) {
        results.set(channelId, data);
      }
    }

    return results;
  }

  /**
   * Update channels in batches to avoid API rate limits
   */
  private async updateChannelsInBatches(channelIds: string[]): Promise<Map<string, LiveStatusCache>> {
    const results = new Map<string, LiveStatusCache>();
    const batchSize = 10; // Process 10 channels at a time

    for (let i = 0; i < channelIds.length; i += batchSize) {
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
      if (!(await this.configService.canFetchLive(handle))) {
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
      const schedules = await this.schedulesService.findByDay(currentDay);
      const ttl = await getCurrentBlockTTL(channelId, schedules);
      
      // Calculate block end time for cache metadata
      const blockEndTime = this.calculateBlockEndTime(liveSchedules, currentTime);

      // Check if we have a cached video ID first
      const streamsKey = `liveStreamsByChannel:${channelId}`;
      const cachedStreams = await this.redisService.get<string>(streamsKey);
      
      if (cachedStreams) {
        // We have a cached video ID, check if it needs validation
        const streams = JSON.parse(cachedStreams);
        if (streams.primaryVideoId && Date.now() > streams.validationCooldown) {
          // Validation cooldown expired, check if video is still live
          const isStillLive = await this.youtubeLiveService.isVideoLive(streams.primaryVideoId);
          if (isStillLive) {
            // Video is still live, update cooldown and continue
            console.log(`[LIVE-STATUS-BG] Video ID ${streams.primaryVideoId} still live for ${handle}`);
            // Update the cache with new validation cooldown
            streams.validationCooldown = Date.now() + (30 * 60 * 1000);
            await this.redisService.set(streamsKey, JSON.stringify(streams), ttl);
            return this.createCacheDataFromStreams(channelId, handle, streams, ttl, blockEndTime);
          } else {
            // Video is no longer live, clear cache and fetch new one
            console.log(`[LIVE-STATUS-BG] Video ID ${streams.primaryVideoId} no longer live for ${handle}, fetching new one`);
            await this.redisService.del(streamsKey);
          }
        } else if (streams.primaryVideoId) {
          // Validation cooldown still active, use cached data
          console.log(`[LIVE-STATUS-BG] Using cached video ID ${streams.primaryVideoId} for ${handle} (cooldown active)`);
          return this.createCacheDataFromStreams(channelId, handle, streams, ttl, blockEndTime);
        }
      }
      
      // No cached video ID or validation failed, check not-found cache
      const notFoundKey = `videoIdNotFound:${channelId}`;
      const notFoundData = await this.redisService.get<string>(notFoundKey);
      
      if (notFoundData) {
        // Channel is marked as not-found, skip fetching
        console.log(`[LIVE-STATUS-BG] Skipping ${handle} - marked as not-found`);
        return this.createNotLiveCacheData(channelId, handle, ttl);
      }
      
      // Fetch live streams from YouTube
      console.log(`[LIVE-STATUS-BG] Fetching live streams for ${handle} (${channelId})`);
      const liveStreams = await this.youtubeLiveService.getLiveStreams(
        channelId,
        handle,
        ttl,
        'cron', // Background context
        false, // Don't ignore not-found cache
        'main' // Use main cron type to enable escalation
      );
      console.log(`[LIVE-STATUS-BG] Live streams result for ${handle}:`, liveStreams);

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

      console.log(`[LIVE-STATUS-BG] Cache data for ${handle}:`, cacheData);

      await this.cacheLiveStatus(channelId, cacheData);
      return cacheData;

    } catch (error) {
      this.logger.error(`❌ Error updating live status for channel ${channelId}:`, error);
      return null;
    }
  }

  /**
   * Cache live status data
   */
  private async cacheLiveStatus(channelId: string, data: LiveStatusCache): Promise<void> {
    const cacheKey = `${this.CACHE_PREFIX}${channelId}`;
    await this.redisService.set(cacheKey, data, data.ttl);
    this.logger.log(`✅ Live status cache updated for channel ${data.handle} (${channelId}): isLive=${data.isLive}, streams=${data.streamCount}`);
  }

  /**
   * Check if cache should be updated
   * Considers both TTL and video ID validation needs
   */
  private async shouldUpdateCache(cached: LiveStatusCache): Promise<boolean> {
    const now = Date.now();
    const age = now - cached.lastUpdated;
    
    // Always update if TTL has expired
    if (age > cached.ttl * 1000) {
      return true;
    }
    
    // Check if we need to validate the video ID
    if (cached.isLive && cached.videoId && now > cached.validationCooldown) {
      // Validate if the cached video ID is still live
      const isStillLive = await this.youtubeLiveService.isVideoLive(cached.videoId);
      if (!isStillLive) {
        this.logger.log(`🔄 Video ID ${cached.videoId} no longer live, updating cache`);
        return true;
      }
      
      // Update validation cooldown (validate again in 30 minutes)
      cached.validationCooldown = now + (30 * 60 * 1000);
      cached.lastValidation = now;
      await this.cacheLiveStatus(cached.channelId, cached);
    }
    
    // Update when 80% of TTL has passed
    return age > cached.ttl * 1000 * 0.8;
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
   * Update live status for all channels (Approach B: separate cache management)
   */
  private async updateLiveStatusForAllChannels(): Promise<void> {
    try {
      this.logger.log('[LIVE-STATUS-UPDATE] Updating live status for all channels');
      
      // Get all channels that have live schedules
      const channels = await this.channelsRepository.find({
        where: { is_visible: true },
        select: ['id', 'name', 'handle', 'youtube_channel_id']
      });

      const channelIds = channels
        .filter(channel => channel.youtube_channel_id)
        .map(channel => channel.youtube_channel_id);

      if (channelIds.length === 0) {
        this.logger.log('[LIVE-STATUS-UPDATE] No channels with YouTube IDs found');
        return;
      }

      this.logger.log(`[LIVE-STATUS-UPDATE] Updating live status for ${channelIds.length} channels`);
      
      // Update live status for all channels
      await this.updateChannelsInBatches(channelIds);
      
      this.logger.log('[LIVE-STATUS-UPDATE] Completed live status update for all channels');

    } catch (error) {
      this.logger.error('[LIVE-STATUS-UPDATE] Error updating live status for all channels:', error);
    }
  }
}
