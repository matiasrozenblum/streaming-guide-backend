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
}

@Injectable()
export class LiveStatusBackgroundService {
  private readonly logger = new Logger(LiveStatusBackgroundService.name);
  private readonly CACHE_PREFIX = 'liveStatus:background:';
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

      // Get all visible channels
      const channels = await this.channelsRepository.find({
        where: { is_visible: true },
        relations: ['programs', 'programs.schedules'],
      });

      const channelsToUpdate: string[] = [];

      // Filter channels that have programs running right now
      for (const channel of channels) {
        if (!channel.youtube_channel_id || !channel.handle) continue;

        // Check if channel has programs running now
        const hasLiveProgram = channel.programs.some(program =>
          program.schedules.some(schedule =>
            schedule.day_of_week === currentDay &&
            currentTime >= this.convertTimeToNumber(schedule.start_time) &&
            currentTime < this.convertTimeToNumber(schedule.end_time)
          )
        );

        if (hasLiveProgram) {
          // Check if we need to update this channel's live status
          const cacheKey = `${this.CACHE_PREFIX}${channel.youtube_channel_id}`;
          const cached = await this.redisService.get<LiveStatusCache>(cacheKey);
          
          if (!cached || await this.shouldUpdateCache(cached)) {
            channelsToUpdate.push(channel.youtube_channel_id);
          }
        }
      }

      this.logger.log(`📊 Found ${channelsToUpdate.length} channels needing live status update`);

      if (channelsToUpdate.length === 0) {
        this.logger.log('✅ All channels up to date, skipping update');
        return;
      }

      // Update live status for channels in batches
      await this.updateChannelsInBatches(channelsToUpdate);

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
      // Get channel info with optimized query - only load current day schedules
      const channel = await this.channelsRepository
        .createQueryBuilder('channel')
        .leftJoinAndSelect('channel.programs', 'program')
        .leftJoinAndSelect('program.schedules', 'schedule')
        .where('channel.youtube_channel_id = :channelId', { channelId })
        .andWhere('schedule.day_of_week = :currentDay', { currentDay: TimezoneUtil.currentDayOfWeek() })
        .andWhere('schedule.start_time <= :currentTime', { currentTime: TimezoneUtil.currentTimeString() })
        .andWhere('schedule.end_time > :currentTime', { currentTime: TimezoneUtil.currentTimeString() })
        .getOne();

      if (!channel || !channel.handle) {
        return null;
      }

      // Check if channel is enabled for live fetching
      if (!(await this.configService.canFetchLive(channel.handle))) {
        return null;
      }

      // Get current program TTL
      const currentDay = TimezoneUtil.currentDayOfWeek();
      const currentTime = TimezoneUtil.currentTimeInMinutes();
      
      const liveSchedules = channel.programs.flatMap(program =>
        program.schedules.filter(schedule =>
          schedule.day_of_week === currentDay &&
          currentTime >= this.convertTimeToNumber(schedule.start_time) &&
          currentTime < this.convertTimeToNumber(schedule.end_time)
        )
      );

      if (liveSchedules.length === 0) {
        // No live programs, cache as not live
        const cacheData: LiveStatusCache = {
          channelId,
          handle: channel.handle,
          isLive: false,
          streamUrl: null,
          videoId: null,
          lastUpdated: Date.now(),
          ttl: 5 * 60, // 5 minutes
          blockEndTime: 24 * 60, // End of day
          validationCooldown: Date.now() + (15 * 60 * 1000),
          lastValidation: Date.now(),
        };
        await this.cacheLiveStatus(channelId, cacheData);
        return cacheData;
      }

      // Calculate TTL using block TTL logic for accurate timing
      const schedules = await this.schedulesService.findByDay(currentDay);
      const ttl = await getCurrentBlockTTL(channelId, schedules);
      
      // Calculate block end time for cache metadata
      const blockEndTime = this.calculateBlockEndTime(liveSchedules, currentTime);

      // Fetch live streams from YouTube
      const liveStreams = await this.youtubeLiveService.getLiveStreams(
        channelId,
        channel.handle,
        ttl,
        'cron' // Background context
      );

      const cacheData: LiveStatusCache = {
        channelId,
        handle: channel.handle,
        isLive: liveStreams !== null && liveStreams !== '__SKIPPED__' && liveStreams.streams.length > 0,
        streamUrl: liveStreams && liveStreams !== '__SKIPPED__' && liveStreams.streams.length > 0 
          ? `https://www.youtube.com/embed/${liveStreams.primaryVideoId}?autoplay=1`
          : null,
        videoId: liveStreams && liveStreams !== '__SKIPPED__' ? liveStreams.primaryVideoId : null,
        lastUpdated: Date.now(),
        ttl,
        blockEndTime,
        validationCooldown: Date.now() + (15 * 60 * 1000), // Can validate again in 15 minutes
        lastValidation: Date.now(),
      };

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
      
      // Update validation cooldown (validate again in 15 minutes)
      cached.validationCooldown = now + (15 * 60 * 1000);
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
}
