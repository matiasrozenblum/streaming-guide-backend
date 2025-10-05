import { Injectable, Inject, forwardRef } from '@nestjs/common';
import axios from 'axios';
import * as cron from 'node-cron';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';
import * as DateHolidays from 'date-holidays';

import { SchedulesService } from '../schedules/schedules.service';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '../config/config.service';
import { SentryService } from '../sentry/sentry.service';
import { getCurrentBlockTTL } from '@/utils/getBlockTTL.util';
import { LiveStream, LiveStreamsResult } from './interfaces/live-stream.interface';

const HolidaysClass = (DateHolidays as any).default ?? DateHolidays;

@Injectable()
export class YoutubeLiveService {
  private readonly apiKey = process.env.YOUTUBE_API_KEY;
  private readonly apiUrl = 'https://www.googleapis.com/youtube/v3';
  private readonly validationCooldowns = new Map<string, number>(); // Track last validation time per channel
  private readonly COOLDOWN_PERIOD = 5 * 60 * 1000; // 5 minutes cooldown
  
  // YouTube API usage tracking
  private readonly apiUsageTracker = {
    dailySearchCalls: 0,
    dailyVideoCalls: 0,
    dailySearchCost: 0, // 100 units per search call
    dailyVideoCost: 0,  // 1 unit per video call
    channelFetchFrequency: new Map<string, { count: number; lastFetch: Date }>(),
    resetDaily: () => {
      this.apiUsageTracker.dailySearchCalls = 0;
      this.apiUsageTracker.dailyVideoCalls = 0;
      this.apiUsageTracker.dailySearchCost = 0;
      this.apiUsageTracker.dailyVideoCost = 0;
      this.apiUsageTracker.channelFetchFrequency.clear();
    }
  };

  constructor(
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => SchedulesService))
    private readonly schedulesService: SchedulesService,
    private readonly redisService: RedisService,
    private readonly sentryService: SentryService,
  ) {
    dayjs.extend(utc);
    dayjs.extend(timezone);

    console.log('🚀 YoutubeLiveService initialized');
    
    // Daily reset for API usage tracking at midnight
    cron.schedule('0 0 * * *', async () => {
      console.log('📊 Resetting daily YouTube API usage tracker');
      await this.logDailyUsageStats(); // Log stats before reset
      this.apiUsageTracker.resetDaily();
    }, {
      timezone: 'America/Argentina/Buenos_Aires',
    });
    
    // Load existing data from Redis on startup
    this.loadUsageFromRedis();
    
    // Hourly usage stats logging
    cron.schedule('0 * * * *', () => {
      this.logHourlyUsageStats();
    }, {
      timezone: 'America/Argentina/Buenos_Aires',
    });
    
    // Main cron: runs every hour at :00
    cron.schedule('0 * * * *', () => this.fetchLiveVideoIds('main'), {
      timezone: 'America/Argentina/Buenos_Aires',
    });
    
    // Back-to-back fix cron: runs 7 minutes after each hour to catch overlapping programs
    cron.schedule('7 * * * *', () => this.fetchLiveVideoIds('back-to-back-fix'), {
      timezone: 'America/Argentina/Buenos_Aires',
    });

    // Program start detection: runs every 2 minutes to catch program transitions (reduced frequency)
    cron.schedule('*/2 * * * *', () => this.checkProgramStarts(), {
      timezone: 'America/Argentina/Buenos_Aires',
    });
  }

  /**
   * Track YouTube API usage for monitoring and optimization
   */
  private async trackApiUsage(type: 'search' | 'video', channelId?: string, channelHandle?: string) {
    const today = dayjs().format('YYYY-MM-DD');
    
    if (type === 'search') {
      this.apiUsageTracker.dailySearchCalls++;
      this.apiUsageTracker.dailySearchCost += 100; // 100 units per search call
      
      // Persist to Redis for reliability
      await this.persistUsageToRedis(today, 'search', channelId, channelHandle);
      
      if (channelId && channelHandle) {
        const existing = this.apiUsageTracker.channelFetchFrequency.get(channelId);
        const newCount = (existing?.count || 0) + 1;
        this.apiUsageTracker.channelFetchFrequency.set(channelId, {
          count: newCount,
          lastFetch: new Date()
        });
        
        // Persist channel frequency to Redis
        await this.redisService.set(
          `youtube_api:channel_frequency:${today}:${channelId}`,
          JSON.stringify({ count: newCount, lastFetch: new Date(), handle: channelHandle }),
          7 * 24 * 60 * 60 // 7 days TTL
        );
        
        // Log frequent fetchers
        if (newCount > 10) {
          console.log(`⚠️ High fetch frequency detected for ${channelHandle} (${channelId}): ${newCount} fetches today`);
        }
      }
    } else if (type === 'video') {
      this.apiUsageTracker.dailyVideoCalls++;
      this.apiUsageTracker.dailyVideoCost += 1; // 1 unit per video call
      
      // Persist to Redis for reliability
      await this.persistUsageToRedis(today, 'video', channelId, channelHandle);
    }
  }

  /**
   * Persist usage data to Redis for reliability
   */
  private async persistUsageToRedis(date: string, type: 'search' | 'video', channelId?: string, channelHandle?: string) {
    const key = `youtube_api:usage:${date}:${type}`;
    const cost = type === 'search' ? 100 : 1;
    
    try {
      // Increment counters in Redis
      await this.redisService.client.hincrby(key, 'count', 1);
      await this.redisService.client.hincrby(key, 'cost', cost);
      
      // Set expiration to 30 days
      await this.redisService.client.expire(key, 30 * 24 * 60 * 60);
      
      // Track per-channel usage if provided
      if (channelId && channelHandle) {
        const channelKey = `youtube_api:usage:${date}:${type}:channels:${channelId}`;
        await this.redisService.client.hincrby(channelKey, 'count', 1);
        await this.redisService.client.hincrby(channelKey, 'cost', cost);
        await this.redisService.client.hset(channelKey, 'handle', channelHandle);
        await this.redisService.client.expire(channelKey, 30 * 24 * 60 * 60);
      }
    } catch (error) {
      console.error('Failed to persist usage to Redis:', error);
    }
  }

  /**
   * Log hourly usage statistics
   */
  private logHourlyUsageStats() {
    const totalCost = this.apiUsageTracker.dailySearchCost + this.apiUsageTracker.dailyVideoCost;
    const totalCalls = this.apiUsageTracker.dailySearchCalls + this.apiUsageTracker.dailyVideoCalls;
    
    console.log(`📊 YouTube API Usage (Hourly): Search calls: ${this.apiUsageTracker.dailySearchCalls} (${this.apiUsageTracker.dailySearchCost} units), Video calls: ${this.apiUsageTracker.dailyVideoCalls} (${this.apiUsageTracker.dailyVideoCost} units), Total: ${totalCalls} calls, ${totalCost} units`);
    
    // Log top channels by fetch frequency
    const sortedChannels = Array.from(this.apiUsageTracker.channelFetchFrequency.entries())
      .sort(([,a], [,b]) => b.count - a.count)
      .slice(0, 5);
    
    if (sortedChannels.length > 0) {
      console.log('🔝 Top channels by fetch frequency:', sortedChannels.map(([channelId, data]) => 
        `${channelId}: ${data.count} fetches`
      ).join(', '));
    }
  }

  /**
   * Log daily usage statistics and send to PostHog
   */
  private async logDailyUsageStats() {
    const totalCost = this.apiUsageTracker.dailySearchCost + this.apiUsageTracker.dailyVideoCost;
    const totalCalls = this.apiUsageTracker.dailySearchCalls + this.apiUsageTracker.dailyVideoCalls;
    
    console.log(`📊 YouTube API Daily Summary: ${totalCalls} total calls, ${totalCost} total units consumed`);
    console.log(`   - Search calls: ${this.apiUsageTracker.dailySearchCalls} (${this.apiUsageTracker.dailySearchCost} units)`);
    console.log(`   - Video calls: ${this.apiUsageTracker.dailyVideoCalls} (${this.apiUsageTracker.dailyVideoCost} units)`);
    
    // Get channel frequency data
    const channelFrequencies = Array.from(this.apiUsageTracker.channelFetchFrequency.entries())
      .sort(([,a], [,b]) => b.count - a.count)
      .slice(0, 10);
    
    // Send to PostHog for analytics (if available)
    try {
      // PostHog event for daily usage
      if (process.env.POSTHOG_API_KEY) {
        const posthog = require('posthog-node').default;
        const client = new posthog(process.env.POSTHOG_API_KEY);
        
        await client.capture({
          distinctId: 'youtube-api-service',
          event: 'youtube_api_daily_usage',
          properties: {
            dailySearchCalls: this.apiUsageTracker.dailySearchCalls,
            dailyVideoCalls: this.apiUsageTracker.dailyVideoCalls,
            dailySearchCost: this.apiUsageTracker.dailySearchCost,
            dailyVideoCost: this.apiUsageTracker.dailyVideoCost,
            totalCost,
            totalCalls,
            topChannels: channelFrequencies.map(([channelId, data]) => ({
              channelId,
              count: data.count,
              lastFetch: data.lastFetch
            })),
            date: dayjs().format('YYYY-MM-DD'),
            environment: process.env.NODE_ENV || 'development'
          }
        });
        
        console.log('📈 Daily usage data sent to PostHog');
      }
    } catch (error) {
      console.error('Failed to send data to PostHog:', error);
    }
    
    // Send to Sentry only for critical alerts (quota > 80%)
    if (totalCost > 8000) { // 80% of 10k quota
      this.sentryService.captureMessage('YouTube API High Usage Alert', 'warning', {
        dailySearchCalls: this.apiUsageTracker.dailySearchCalls,
        dailyVideoCalls: this.apiUsageTracker.dailyVideoCalls,
        dailySearchCost: this.apiUsageTracker.dailySearchCost,
        dailyVideoCost: this.apiUsageTracker.dailyVideoCost,
        totalCost,
        totalCalls,
        quotaPercentage: (totalCost / 10000) * 100,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Load usage data from Redis on startup
   */
  private async loadUsageFromRedis() {
    try {
      const today = dayjs().format('YYYY-MM-DD');
      
      // Load daily search usage
      const searchKey = `youtube_api:usage:${today}:search`;
      const searchData = await this.redisService.client.hgetall(searchKey);
      if (searchData.count) {
        this.apiUsageTracker.dailySearchCalls = parseInt(searchData.count);
        this.apiUsageTracker.dailySearchCost = parseInt(searchData.cost);
      }
      
      // Load daily video usage
      const videoKey = `youtube_api:usage:${today}:video`;
      const videoData = await this.redisService.client.hgetall(videoKey);
      if (videoData.count) {
        this.apiUsageTracker.dailyVideoCalls = parseInt(videoData.count);
        this.apiUsageTracker.dailyVideoCost = parseInt(videoData.cost);
      }
      
      // Load channel frequencies
      const channelKeys = await this.redisService.client.keys(`youtube_api:channel_frequency:${today}:*`);
      for (const key of channelKeys) {
        const channelId = key.split(':')[3];
        const channelData = await this.redisService.get<string>(key);
        if (channelData) {
          const parsed = JSON.parse(channelData);
          this.apiUsageTracker.channelFetchFrequency.set(channelId, {
            count: parsed.count,
            lastFetch: new Date(parsed.lastFetch)
          });
        }
      }
      
      console.log(`📊 Loaded usage data from Redis: ${this.apiUsageTracker.dailySearchCalls} search calls, ${this.apiUsageTracker.dailyVideoCalls} video calls`);
    } catch (error) {
      console.error('Failed to load usage data from Redis:', error);
    }
  }

  /**
   * Get current API usage statistics
   */
  getApiUsageStats() {
    return {
      dailySearchCalls: this.apiUsageTracker.dailySearchCalls,
      dailyVideoCalls: this.apiUsageTracker.dailyVideoCalls,
      dailySearchCost: this.apiUsageTracker.dailySearchCost,
      dailyVideoCost: this.apiUsageTracker.dailyVideoCost,
      totalCost: this.apiUsageTracker.dailySearchCost + this.apiUsageTracker.dailyVideoCost,
      totalCalls: this.apiUsageTracker.dailySearchCalls + this.apiUsageTracker.dailyVideoCalls,
      channelFetchFrequency: Object.fromEntries(this.apiUsageTracker.channelFetchFrequency)
    };
  }

  /**
   * Notify connected clients about live status changes
   */
  private async notifyLiveStatusChange(channelId: string, videoId: string | null, channelName: string) {
    try {
      // Store the notification in Redis for SSE clients to pick up
      const notification = {
        type: 'live_status_change',
        channelId,
        videoId,
        channelName,
        timestamp: Date.now(),
      };
      
      await this.redisService.set(
        `live_notification:${channelId}:${Date.now()}`,
        JSON.stringify(notification),
        300 // 5 minutes TTL
      );
      
      console.log(`📡 Notified clients about live status change for ${channelName}: ${videoId || 'no video'}`);
    } catch (error) {
      console.error('Failed to notify live status change:', error);
    }
  }

  /**
   * Devuelve videoId | null | '__SKIPPED__' según estado de flags, cache y fetch
   * @deprecated Use getLiveStreams() for multiple streams support
   */
  async getLiveVideoId(
    channelId: string,
    handle: string,
    blockTTL: number,
    context: 'cron' | 'onDemand' | 'program-start',
  ): Promise<string | null | '__SKIPPED__'> {
    // gating centralizado
    if (!(await this.configService.canFetchLive(handle))) {
      console.log(`[YouTube] fetch skipped for ${handle}`);
      return '__SKIPPED__';
    }

    const streamsKey = `liveStreamsByChannel:${channelId}`;
    const notFoundKey = `videoIdNotFound:${channelId}`;

    // skip rápido si ya está marcado como no-found
    if (await this.redisService.get<string>(notFoundKey)) {
      console.log(`🚫 Skipping ${handle}, marked as not-found`);
      return '__SKIPPED__';
    }

    // cache-hit: reuse si sigue vivo
    const cachedStreams = await this.redisService.get<string>(streamsKey);
    if (cachedStreams) {
      try {
        const streams = JSON.parse(cachedStreams);
        if (streams.primaryVideoId && (await this.isVideoLive(streams.primaryVideoId))) {
          console.log(`🔁 Reusing cached primary videoId for ${handle}`);
          return streams.primaryVideoId;
        }
        // If cached streams are no longer live, clear the cache
        await this.redisService.del(streamsKey);
        console.log(`🗑️ Deleted cached streams for ${handle} (no longer live)`);
      } catch (error) {
        // If parsing fails, clear the corrupted cache
        await this.redisService.del(streamsKey);
        console.log(`🗑️ Deleted corrupted cached streams for ${handle}`);
      }
    }

    // fetch a YouTube
    try {
      // Track API usage
      await this.trackApiUsage('search', channelId, handle);
      
      const { data } = await axios.get(`${this.apiUrl}/search`, {
        params: {
          part: 'snippet',
          channelId,
          eventType: 'live',
          type: 'video',
          key: this.apiKey,
        },
      });
      const videoId = data.items?.[0]?.id?.videoId ?? null;

      if (!videoId) {
        console.log(`🚫 No live video for ${handle} (${context})`);
        await this.redisService.set(notFoundKey, '1', 900);
        return null;
      }

      // Cache as streams format for consistency
      const streamsData = {
        streams: [{ videoId, title: '', description: '', thumbnailUrl: '', publishedAt: new Date().toISOString() }],
        primaryVideoId: videoId,
        streamCount: 1
      };
      await this.redisService.set(streamsKey, JSON.stringify(streamsData), blockTTL);
      console.log(`📌 Cached ${handle} → ${videoId} (TTL ${blockTTL}s)`);

      // Notify clients about the new video ID
      if (context === 'cron') {
        await this.notifyLiveStatusChange(channelId, videoId, handle);
      }

      return videoId;
    } catch (err) {
      const errorMessage = err.message || err;
      console.error(`❌ Error fetching live video for ${handle}:`, errorMessage);
      
      // Enhanced error reporting with Sentry
      const is403Error = errorMessage.includes('403') || errorMessage.includes('forbidden');
      const isQuotaError = errorMessage.includes('quota') || errorMessage.includes('exceeded');
      
      if (is403Error) {
        this.sentryService.captureMessage(
          `YouTube API 403 Forbidden for channel ${handle}`,
          'error',
          {
            channelId,
            handle,
            context,
            errorMessage,
            apiUrl: `${this.apiUrl}/search`,
            timestamp: new Date().toISOString(),
          }
        );
        
        // Set tags for better alerting
        this.sentryService.setTag('service', 'youtube-api');
        this.sentryService.setTag('error_type', '403_forbidden');
        this.sentryService.setTag('channel', handle);
      } else if (isQuotaError) {
        this.sentryService.captureMessage(
          `YouTube API quota exceeded for channel ${handle}`,
          'warning',
          {
            channelId,
            handle,
            context,
            errorMessage,
            timestamp: new Date().toISOString(),
          }
        );
        
        this.sentryService.setTag('service', 'youtube-api');
        this.sentryService.setTag('error_type', 'quota_exceeded');
        this.sentryService.setTag('channel', handle);
      } else {
        // Capture other errors
        this.sentryService.captureException(err as Error, {
          channelId,
          handle,
          context,
          apiUrl: `${this.apiUrl}/search`,
        });
      }
      
      return null;
    }
  }

  /**
   * Batch fetch live streams for multiple channels in a single API call
   */
  async getBatchLiveStreams(
    channelIds: string[],
    context: 'cron' | 'onDemand' | 'program-start',
    channelTTLs: Map<string, number>, // Required TTL map for each channel
  ): Promise<Map<string, LiveStreamsResult | null | '__SKIPPED__'>> {
    const results = new Map<string, LiveStreamsResult | null | '__SKIPPED__'>();
    
    if (channelIds.length === 0) return results;

    console.log(`[Batch] Fetching live streams for ${channelIds.length} channels`);
    
    // First, check cache for each channel and collect channels that need fresh fetching
    const channelsToFetch: string[] = [];
    const channelHandles = new Map<string, string>(); // Map channelId to handle for logging
    
    for (const channelId of channelIds) {
      // We need to get the handle for this channel to check config and for logging
      // For now, we'll fetch all and let individual channel processing handle the config check
      const liveKey = `liveStreamsByChannel:${channelId}`;
      const notFoundKey = `videoIdNotFound:${channelId}`;

      // Skip if marked as not-found
      if (await this.redisService.get<string>(notFoundKey)) {
        results.set(channelId, '__SKIPPED__');
        continue;
      }

      // Check cache
      const cachedStreams = await this.redisService.get<string>(liveKey);
      if (cachedStreams) {
        try {
          const parsedStreams: LiveStream[] = JSON.parse(cachedStreams);
          // Skip validation during bulk operations to improve performance for onDemand context
          if (parsedStreams.length > 0 && (context === 'onDemand' || (await this.isVideoLive(parsedStreams[0].videoId)))) {
            console.log(`🔁 [Batch] Reusing cached streams for channel ${channelId} (${parsedStreams.length} streams)`);
            results.set(channelId, {
              streams: parsedStreams,
              primaryVideoId: parsedStreams[0].videoId,
              streamCount: parsedStreams.length
            });
            continue;
          } else {
            // If cached streams are invalid, delete them
            await this.redisService.del(liveKey);
            console.log(`🗑️ [Batch] Deleted cached streams for channel ${channelId} (no longer live)`);
          }
        } catch (error) {
          console.warn(`[Batch] Failed to parse cached streams for channel ${channelId}:`, error);
          await this.redisService.del(liveKey);
        }
      }
      
      // Channel needs fresh fetching
      channelsToFetch.push(channelId);
    }

    // Only fetch channels that don't have valid cached data
    if (channelsToFetch.length === 0) {
      console.log(`[Batch] All channels served from cache`);
      return results;
    }

    console.log(`[Batch] Fresh fetch needed for ${channelsToFetch.length} channels (${channelIds.length - channelsToFetch.length} served from cache)`);
    
    try {
      // YouTube API supports up to 50 channel IDs in a single search request
      // We'll split into chunks if needed
      const chunkSize = 50;
      const chunks: string[][] = [];
      for (let i = 0; i < channelsToFetch.length; i += chunkSize) {
        chunks.push(channelsToFetch.slice(i, i + chunkSize));
      }

      for (const chunk of chunks) {
        const channelIdsParam = chunk.join(',');
        
        // Track API usage for batch call
        await this.trackApiUsage('search');
        console.log(`[Batch] Making YouTube API call for ${chunk.length} channels: ${chunk.join(', ')}`);
        
        const { data } = await axios.get(`${this.apiUrl}/search`, {
          params: {
            part: 'snippet',
            channelId: channelIdsParam,
            eventType: 'live',
            type: 'video',
            key: this.apiKey,
            maxResults: 50, // Max per channel, but we'll get the first few
          },
        });

        // Group results by channel ID
        const streamsByChannel = new Map<string, LiveStream[]>();
        
        (data.items || []).forEach((item: any) => {
          const channelId = item.snippet.channelId;
          if (!streamsByChannel.has(channelId)) {
            streamsByChannel.set(channelId, []);
          }
          
          streamsByChannel.get(channelId)!.push({
            videoId: item.id.videoId,
            title: item.snippet.title,
            publishedAt: item.snippet.publishedAt,
            description: item.snippet.description,
            thumbnailUrl: item.snippet.thumbnails?.medium?.url,
            channelTitle: item.snippet.channelTitle,
          });
        });

        // Process results for each channel and cache them
        for (const channelId of chunk) {
          const streams = streamsByChannel.get(channelId);
          if (streams && streams.length > 0) {
            const liveStreamsResult = {
              streams,
              primaryVideoId: streams[0].videoId,
              streamCount: streams.length
            };
            
            results.set(channelId, liveStreamsResult);
            
            // Cache the result with intelligent TTL based on program schedule
            const liveKey = `liveStreamsByChannel:${channelId}`;
            const blockTTL = channelTTLs.get(channelId)!;
            await this.redisService.set(liveKey, JSON.stringify(streams), blockTTL);
            console.log(`💾 [Batch] Cached ${streams.length} streams for channel ${channelId} (TTL: ${blockTTL}s)`);
          } else {
            results.set(channelId, null);
            
            // Cache the "not found" result to avoid repeated API calls
            const notFoundKey = `videoIdNotFound:${channelId}`;
            const blockTTL = channelTTLs.get(channelId)!;
            await this.redisService.set(notFoundKey, '1', blockTTL);
            console.log(`🚫 [Batch] Cached not-found for channel ${channelId} (TTL: ${blockTTL}s)`);
          }
        }
      }

      console.log(`[Batch] Completed batch fetch for ${channelsToFetch.length} channels`);
      return results;
      
    } catch (error) {
      console.error(`[Batch] Error in batch fetch:`, error);
      // Return null for all channels on error
      channelIds.forEach(channelId => results.set(channelId, null));
      return results;
    }
  }

  /**
   * Gets all live streams for a channel (new method supporting multiple streams)
   */
  async getLiveStreams(
    channelId: string,
    handle: string,
    blockTTL: number,
    context: 'cron' | 'onDemand' | 'program-start',
  ): Promise<LiveStreamsResult | null | '__SKIPPED__'> {
    // gating centralizado
    if (!(await this.configService.canFetchLive(handle))) {
      console.log(`[YouTube] fetch skipped for ${handle}`);
      return '__SKIPPED__';
    }

    const liveKey = `liveStreamsByChannel:${channelId}`;
    const notFoundKey = `videoIdNotFound:${channelId}`;

    // skip rápido si ya está marcado como no-found
    if (await this.redisService.get<string>(notFoundKey)) {
      console.log(`🚫 Skipping ${handle}, marked as not-found`);
      return '__SKIPPED__';
    }

    // cache-hit: reuse si sigue vivo
    const cachedStreams = await this.redisService.get<string>(liveKey);
    if (cachedStreams) {
      try {
        const parsedStreams: LiveStream[] = JSON.parse(cachedStreams);
        // Skip validation during bulk operations to improve performance
        // Validate that at least the primary stream is still live (skip for onDemand context)
        if (parsedStreams.length > 0 && (context === 'cron' || context === 'program-start' ? (await this.isVideoLive(parsedStreams[0].videoId)) : true)) {
          console.log(`🔁 Reusing cached streams for ${handle} (${parsedStreams.length} streams)`);
          return {
            streams: parsedStreams,
            primaryVideoId: parsedStreams[0].videoId,
            streamCount: parsedStreams.length
          };
        }
      } catch (error) {
        console.warn(`Failed to parse cached streams for ${handle}:`, error);
      }
      
      // If cached streams are invalid, delete them
      await this.redisService.del(liveKey);
      console.log(`🗑️ Deleted cached streams for ${handle} (no longer live)`);
    }

    // fetch from YouTube
    try {
      // Track API usage
      await this.trackApiUsage('search', channelId, handle);
      
      const { data } = await axios.get(`${this.apiUrl}/search`, {
        params: {
          part: 'snippet',
          channelId,
          eventType: 'live',
          type: 'video',
          key: this.apiKey,
          maxResults: 10, // Get up to 10 live streams
        },
      });
      

      const liveStreams: LiveStream[] = (data.items || []).map((item: any) => ({
        videoId: item.id.videoId,
        title: item.snippet.title,
        publishedAt: item.snippet.publishedAt,
        description: item.snippet.description,
        thumbnailUrl: item.snippet.thumbnails?.medium?.url,
        channelTitle: item.snippet.channelTitle,
      }));

      if (liveStreams.length === 0) {
        console.log(`🚫 No live streams for ${handle} (${context})`);
        await this.redisService.set(notFoundKey, '1', 900);
        return null;
      }

      const result: LiveStreamsResult = {
        streams: liveStreams,
        primaryVideoId: liveStreams[0].videoId,
        streamCount: liveStreams.length
      };

      // Cache the streams
      await this.redisService.set(liveKey, JSON.stringify(liveStreams), blockTTL);
      console.log(`📌 Cached ${handle} → ${liveStreams.length} streams (TTL ${blockTTL}s)`);

      // Notify clients about the new streams
      if (context === 'cron') {
        await this.notifyLiveStatusChange(channelId, liveStreams[0].videoId, handle);
      }

      return result;
    } catch (err) {
      const errorMessage = err.message || err;
      console.error(`❌ Error fetching live streams for ${handle}:`, errorMessage);
      
      // Enhanced error reporting with Sentry
      const is403Error = errorMessage.includes('403') || errorMessage.includes('forbidden');
      const isQuotaError = errorMessage.includes('quota') || errorMessage.includes('exceeded');
      
      if (is403Error) {
        this.sentryService.captureMessage(
          `YouTube API 403 Forbidden for channel ${handle}`,
          'error',
          {
            channelId,
            handle,
            context,
            errorMessage,
            apiUrl: `${this.apiUrl}/search`,
            timestamp: new Date().toISOString(),
          }
        );
        
        // Set tags for better alerting
        this.sentryService.setTag('service', 'youtube-api');
        this.sentryService.setTag('error_type', '403_forbidden');
        this.sentryService.setTag('channel', handle);
      } else if (isQuotaError) {
        this.sentryService.captureMessage(
          `YouTube API quota exceeded for channel ${handle}`,
          'warning',
          {
            channelId,
            handle,
            context,
            errorMessage,
            timestamp: new Date().toISOString(),
          }
        );
        
        this.sentryService.setTag('service', 'youtube-api');
        this.sentryService.setTag('error_type', 'quota_exceeded');
        this.sentryService.setTag('channel', handle);
      } else {
        // Capture other errors
        this.sentryService.captureException(err as Error, {
          channelId,
          handle,
          context,
          apiUrl: `${this.apiUrl}/search`,
        });
      }
      
      return null;
    }
  }

  private async isVideoLive(videoId: string): Promise<boolean> {
    try {
      // Track API usage
      await this.trackApiUsage('video');
      
      const resp = await axios.get(`${this.apiUrl}/videos`, {
        params: { part: 'snippet', id: videoId, key: this.apiKey },
      });
      return resp.data.items?.[0]?.snippet?.liveBroadcastContent === 'live';
    } catch {
      return false;
    }
  }

  /**
   * Itera canales con programación hoy y llama a getLiveVideoId
   */
  async fetchLiveVideoIds(cronType: 'main' | 'back-to-back-fix' = 'main') {
    const cronLabel = cronType === 'main' ? '🕐 MAIN CRON' : '🔄 BACK-TO-BACK FIX CRON';
    const currentTime = dayjs().tz('America/Argentina/Buenos_Aires').format('HH:mm:ss');
    
    console.log(`${cronLabel} started at ${currentTime}`);
    
    const today = dayjs().tz('America/Argentina/Buenos_Aires')
                        .format('dddd')
                        .toLowerCase();
  
    // 1) Primero traés y enriquecés los schedules
    const rawSchedules = await this.schedulesService.findByDay(today);
    const schedules    = await this.schedulesService.enrichSchedules(rawSchedules);
  
    // 2) Filtrás sólo los "on-air" right now
    const liveNow = schedules.filter(s => s.program.is_live);
  
    // 3) Deduplicás canales de esos schedules
    const map = new Map<string,string>();
    for (const s of liveNow) {
      const ch = s.program.channel;
      if (ch?.youtube_channel_id && ch.handle) {
        map.set(ch.youtube_channel_id, ch.handle);
      }
    }
  
    console.log(`${cronLabel} - Channels to refresh: ${map.size}`);
    
    if (map.size === 0) {
      console.log(`${cronLabel} - No live channels to refresh`);
      return;
    }
    
    // OPTIMIZATION: Use batch fetch instead of individual channel fetching
    const channelIds = Array.from(map.keys());
    const channelTTLs = new Map<string, number>();
    
    // Calculate TTLs for all channels
    for (const [cid, handle] of map.entries()) {
      const ttl = await getCurrentBlockTTL(cid, rawSchedules, this.sentryService);
      channelTTLs.set(cid, ttl);
      console.log(`[${cronLabel}] TTL for ${handle}: ${ttl}s`);
    }
    
    // Store before state for back-to-back fix tracking
    const beforeCacheStates = new Map<string, string>();
    if (cronType === 'back-to-back-fix') {
      for (const [cid, handle] of map.entries()) {
        const streamsKey = `liveStreamsByChannel:${cid}`;
        const beforeCache = await this.redisService.get<string>(streamsKey);
        if (beforeCache) {
          beforeCacheStates.set(cid, beforeCache);
        }
      }
    }
    
    // Execute batch fetch for all live channels
    console.log(`[${cronLabel}] Executing batch fetch for ${channelIds.length} channels`);
    const batchResults = await this.getBatchLiveStreams(channelIds, 'cron', channelTTLs);
    
    let updatedCount = 0;
    // Track changes for back-to-back fix
    if (cronType === 'back-to-back-fix') {
      for (const [cid, handle] of map.entries()) {
        const beforeCache = beforeCacheStates.get(cid);
        if (beforeCache) {
          const streamsKey = `liveStreamsByChannel:${cid}`;
          const afterCache = await this.redisService.get<string>(streamsKey);
          if (afterCache) {
            try {
              const beforeStreams = JSON.parse(beforeCache);
              const afterStreams = JSON.parse(afterCache);
              if (beforeStreams.primaryVideoId !== afterStreams.primaryVideoId) {
                updatedCount++;
                console.log(`🔧 ${cronLabel} - FIXED back-to-back issue for ${handle}: ${beforeStreams.primaryVideoId} → ${afterStreams.primaryVideoId}`);
              }
            } catch (error) {
              // If parsing fails, assume it was updated
              updatedCount++;
              console.log(`🔧 ${cronLabel} - FIXED back-to-back issue for ${handle} (cache format changed)`);
            }
          }
        }
      }
    }
    
    // Log batch results
    const resultsSummary = Array.from(batchResults.entries()).map(([cid, result]) => {
      const handle = map.get(cid);
      if (result === '__SKIPPED__') return `${handle}: SKIPPED`;
      if (result === null) return `${handle}: NO_LIVE`;
      return `${handle}: LIVE (${result.streamCount} streams)`;
    }).join(', ');
    
    console.log(`[${cronLabel}] Batch results: ${resultsSummary}`);
    
    if (cronType === 'back-to-back-fix') {
      console.log(`${cronLabel} completed - ${updatedCount} channels updated (back-to-back fixes detected)`);
    } else {
      console.log(`${cronLabel} completed`);
    }
  }

  /**
   * Check for programs starting right now and validate cached video IDs
   * This catches back-to-back program transitions where video IDs might change
   */
  async checkProgramStarts() {
    try {
      const now = dayjs().tz('America/Argentina/Buenos_Aires');
      const currentMinute = now.format('HH:mm');
      const currentDay = now.format('dddd').toLowerCase();
      
      // Find programs starting right now
      const startingPrograms = await this.schedulesService.findByStartTime(currentDay, currentMinute);
      
      if (startingPrograms.length === 0) {
        return; // No programs starting
      }

      console.log(`🎬 Program start detection: ${startingPrograms.length} programs starting at ${currentMinute}`);
      
      // Group by channel to avoid duplicate API calls
      const channelMap = new Map<string, string>();
      for (const program of startingPrograms) {
        if (program.program.channel?.youtube_channel_id && program.program.channel?.handle) {
          channelMap.set(program.program.channel.youtube_channel_id, program.program.channel.handle);
        }
      }

      // Validate cached video IDs for channels with starting programs
      for (const [channelId, handle] of channelMap.entries()) {
        await this.validateCachedVideoId(channelId, handle);
      }

      // Schedule a follow-up check 7 minutes later for delayed starts
      setTimeout(async () => {
        await this.checkDelayedProgramStarts(startingPrograms);
      }, 7 * 60 * 1000); // 7 minutes

    } catch (error) {
      console.error('Error in program start detection:', error);
      this.sentryService.captureException(error);
    }
  }

  /**
   * Follow-up check 7 minutes after program start to catch delayed video ID changes
   */
  private async checkDelayedProgramStarts(programs: any[]) {
    try {
      console.log(`🔄 Delayed program start check: validating ${programs.length} programs`);
      
      // Group by channel to avoid duplicate API calls
      const channelMap = new Map<string, string>();
      for (const program of programs) {
        if (program.program.channel?.youtube_channel_id && program.program.channel?.handle) {
          channelMap.set(program.program.channel.youtube_channel_id, program.program.channel.handle);
        }
      }

      // Validate cached video IDs for channels with starting programs
      for (const [channelId, handle] of channelMap.entries()) {
        await this.validateCachedVideoId(channelId, handle);
      }
    } catch (error) {
      console.error('Error in delayed program start check:', error);
      this.sentryService.captureException(error);
    }
  }

  /**
   * Validate if cached video ID is still live and refresh if needed
   */
  private async validateCachedVideoId(channelId: string, handle: string) {
    try {
      // Check cooldown to prevent excessive API calls
      const now = Date.now();
      const lastValidation = this.validationCooldowns.get(channelId);
      
      if (lastValidation && (now - lastValidation) < this.COOLDOWN_PERIOD) {
        console.log(`⏳ Skipping validation for ${handle} (cooldown active)`);
        return;
      }

      // Check streams cache
      const streamsKey = `liveStreamsByChannel:${channelId}`;
      const cachedStreams = await this.redisService.get<string>(streamsKey);
      
      if (!cachedStreams) {
        return; // No cached data to validate
      }

      // Check if cached streams are still live
      try {
        const streams = JSON.parse(cachedStreams);
        if (streams.primaryVideoId && (await this.isVideoLive(streams.primaryVideoId))) {
          console.log(`✅ Cached streams still live for ${handle}: ${streams.primaryVideoId}`);
          this.validationCooldowns.set(channelId, now); // Update cooldown
          return; // Still live, no action needed
        }
      } catch (error) {
        console.warn(`Failed to parse cached streams for ${handle}:`, error);
      }

      // Video ID/streams are no longer live, refresh them
      console.log(`🔄 Cached data no longer live for ${handle}, refreshing...`);
      
      const schedules = await this.schedulesService.findByDay(dayjs().tz('America/Argentina/Buenos_Aires').format('dddd').toLowerCase());
      const ttl = await getCurrentBlockTTL(channelId, schedules, this.sentryService);
      
      // Use the new getLiveStreams method to refresh
      const streamsResult = await this.getLiveStreams(channelId, handle, ttl, 'program-start');
      
      if (streamsResult && streamsResult !== '__SKIPPED__') {
        console.log(`🆕 Refreshed streams for ${handle}: ${streamsResult.streamCount} streams, primary: ${streamsResult.primaryVideoId}`);
      } else {
        // Clear streams cache if no streams found
        await this.redisService.del(streamsKey);
        console.log(`🗑️ Cleared streams cache for ${handle} (no streams found)`);
      }

      // Update cooldown after validation
      this.validationCooldowns.set(channelId, now);
      
    } catch (error) {
      console.error(`Error validating cached video ID for ${handle}:`, error);
      this.sentryService.captureException(error);
    }
  }
}
