import { Injectable, Inject, forwardRef, Logger } from '@nestjs/common';
import axios from 'axios';
import * as cron from 'node-cron';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';
import * as DateHolidays from 'date-holidays';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';

import { SchedulesService } from '../schedules/schedules.service';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '../config/config.service';
import { SentryService } from '../sentry/sentry.service';
import { Channel } from '../channels/channels.entity';
import { EmailService } from '../email/email.service';
import { getCurrentBlockTTL } from '@/utils/getBlockTTL.util';
import { TimezoneUtil } from '../utils/timezone.util';
import { LiveStream, LiveStreamsResult } from './interfaces/live-stream.interface';
import { LiveStatusCache, createLiveStatusCacheFromStreams, extractLiveStreamsResult } from './interfaces/live-status-cache.interface';

const HolidaysClass = (DateHolidays as any).default ?? DateHolidays;

interface AttemptTracking {
  attempts: number;
  firstAttempt: number;
  lastAttempt: number;
  programEndTime?: number;
  escalated: boolean;
}

@Injectable()
export class YoutubeLiveService {
  private readonly logger = new Logger(YoutubeLiveService.name);
  private readonly apiKey = process.env.YOUTUBE_API_KEY;
  private readonly apiUrl = 'https://www.googleapis.com/youtube/v3';
  private readonly validationCooldowns = new Map<string, number>(); // Track last validation time per channel
  private readonly COOLDOWN_PERIOD = 5 * 60 * 1000; // 5 minutes cooldown
  private readonly inFlightFetches = new Set<string>(); // Track in-flight YouTube API requests to prevent duplicates
  
  // YouTube API usage tracking removed - no longer needed

  constructor(
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => SchedulesService))
    private readonly schedulesService: SchedulesService,
    private readonly redisService: RedisService,
    private readonly sentryService: SentryService,
    private readonly emailService: EmailService,
    @InjectRepository(Channel)
    private readonly channelsRepository: Repository<Channel>,
  ) {
    dayjs.extend(utc);
    dayjs.extend(timezone);

    this.logger.log('🚀 YoutubeLiveService initialized');
    
    // Reduced timezone logging to one line only during initialization
    const now = dayjs().tz('America/Argentina/Buenos_Aires');
    const serverTime = dayjs();
    this.logger.debug(`Timezone: Server=${serverTime.format('Z')} ARG=${now.format('Z')}`);
    
    // YouTube API usage tracking removed - no longer needed
    
    // Main cron: runs every hour at :00
    cron.schedule('0 * * * *', () => this.fetchLiveVideoIdsMain(), {
      timezone: 'America/Argentina/Buenos_Aires',
    });
    
    // Back-to-back fix cron: runs twice per hour at :07 and :37 to catch overlapping programs
    cron.schedule('7 * * * *', () => this.fetchLiveVideoIdsBackToBack(), {
      timezone: 'America/Argentina/Buenos_Aires',
    });
    
    cron.schedule('37 * * * *', () => this.fetchLiveVideoIdsBackToBack(), {
      timezone: 'America/Argentina/Buenos_Aires',
    });

    // Program start detection: runs every 2 minutes to catch program transitions (reduced frequency)
    cron.schedule('*/2 * * * *', () => this.checkProgramStarts(), {
      timezone: 'America/Argentina/Buenos_Aires',
    });
  }

  // YouTube API usage tracking method removed - no longer needed

  // YouTube API usage tracking methods removed - no longer needed

  // YouTube API usage stats method removed - no longer needed


  /**
   * Notify connected clients about live status changes
   */
  private async notifyLiveStatusChange(channelId: string, videoId: string | null, channelName: string) {
    try {
      // Store the notification in Redis for SSE clients to pick up
      const notification = {
        type: 'live_status_changed',  // Fixed: frontend expects 'live_status_changed' not 'live_status_change'
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
      
      this.logger.debug(`Notified live status change for ${channelName}: ${videoId || 'no video'}`);
    } catch (error) {
      this.logger.error('Failed to notify live status change:', error);
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
    try {
      if (!(await this.configService.canFetchLive(handle))) {
        this.logger.debug(`[YouTube] fetch skipped for ${handle}`);
        return '__SKIPPED__';
      }
    } catch (error) {
      // If we can't check the config (e.g., database connection issue), assume it can fetch
      this.logger.warn(`⚠️ Error checking fetch config for ${handle}, allowing fetch:`, error.message);
    }

    // Unified cache - use liveStatusByHandle (replaces liveStreamsByChannel)
    const statusCacheKey = `liveStatusByHandle:${handle}`;
    const notFoundKey = `videoIdNotFound:${handle}`;

    // skip rápido si ya está marcado como no-found
    if (await this.redisService.get<string>(notFoundKey)) {
      this.logger.debug(`🚫 Skipping ${handle}, marked as not-found`);
      return '__SKIPPED__';
    }

    // cache-hit: reuse si sigue vivo (unified cache)
    const cachedStatus = await this.redisService.get<LiveStatusCache>(statusCacheKey);
    if (cachedStatus && cachedStatus.videoId) {
      try {
        if (await this.isVideoLive(cachedStatus.videoId)) {
          this.logger.debug(`🔁 Reusing cached primary videoId for ${handle}`);
          return cachedStatus.videoId;
        }
        // If cached video is no longer live, clear the cache
        await this.redisService.del(statusCacheKey);
        this.logger.debug(`🗑️ Deleted cached status for ${handle} (no longer live)`);
      } catch (error) {
        // If parsing fails, clear the corrupted cache
        await this.redisService.del(statusCacheKey);
        this.logger.debug(`🗑️ Deleted corrupted cached status for ${handle}`);
      }
    }

    // fetch a YouTube
    try {
      // Track API usage
      // YouTube API usage tracking removed
      
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
        this.logger.debug(`🚫 No live video for ${handle} (${context})`);
        await this.handleNotFoundEscalationMain(channelId, handle, notFoundKey);
        return null;
      }

      // Unified cache - write LiveStatusCache (replaces liveStreamsByChannel)
      const streamsData: LiveStreamsResult = {
        streams: [{ videoId, title: '', description: '', thumbnailUrl: '', publishedAt: new Date().toISOString() }],
        primaryVideoId: videoId,
        streamCount: 1
      };
      const cacheData = createLiveStatusCacheFromStreams(channelId, handle, streamsData, blockTTL);
      // Use cacheData.ttl to ensure Redis TTL matches the cache object's TTL field
      await this.redisService.set(statusCacheKey, cacheData, cacheData.ttl);
      
      // Clear the "not-found" flag and attempt tracking since we found live streams
      await this.redisService.del(notFoundKey);
      await this.redisService.del(`notFoundAttempts:${handle}`);
      this.logger.debug(`📌 Cached ${handle} → ${videoId} (TTL ${blockTTL}s)`);

      // Notify clients about the new video ID
      if (context === 'cron') {
        await this.notifyLiveStatusChange(channelId, videoId, handle);
      }

      return videoId;
    } catch (err) {
      const errorMessage = err.message || err;
      this.logger.error(`❌ Error fetching live video for ${handle}:`, errorMessage);
      
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
    } finally {
      // Always remove from in-flight set, even if there was an error
      this.inFlightFetches.delete(channelId);
    }
  }

  /**
   * Batch fetch live streams for multiple channels in a single API call
   */
  async getBatchLiveStreams(
    channelIds: string[],
    context: 'cron' | 'onDemand' | 'program-start',
    channelTTLs: Map<string, number>, // Required TTL map for each channel
    channelHandleMap?: Map<string, string>, // Optional channel handle mapping for tracking
    cronType?: 'main' | 'back-to-back-fix' | 'manual', // Optional cron type to distinguish between main, back-to-back, and manual
  ): Promise<Map<string, LiveStreamsResult | null | '__SKIPPED__'>> {
    const results = new Map<string, LiveStreamsResult | null | '__SKIPPED__'>();
    
    if (channelIds.length === 0) return results;

    this.logger.debug(`Fetching live streams for ${channelIds.length} channels`);
    
    // First, check cache for each channel and collect channels that need fresh fetching
    const channelsToFetch: string[] = [];
    const channelHandles = new Map<string, string>(); // Map channelId to handle for logging
    
    for (const channelId of channelIds) {
      const handle = channelHandleMap?.get(channelId) || 'unknown';
      channelHandles.set(channelId, handle);
      
      // Unified cache - use liveStatusByHandle (replaces liveStreamsByChannel)
      const statusCacheKey = `liveStatusByHandle:${handle}`;
      const notFoundKey = `videoIdNotFound:${handle}`;
      const attemptTrackingKey = `notFoundAttempts:${handle}`;

      // Enhanced not-found logic with escalation detection
      const notFoundData = await this.redisService.get<string>(notFoundKey);
      const attemptData = await this.redisService.get<AttemptTracking>(attemptTrackingKey);

      if (notFoundData && cronType !== 'back-to-back-fix' && cronType !== 'manual') {
        // Check if escalated
        if (attemptData) {
          const tracking: AttemptTracking = attemptData;
          if (tracking.escalated && tracking.programEndTime && Date.now() < tracking.programEndTime) {
            results.set(channelId, '__SKIPPED__');
            continue;
          }
        }
        
        // Normal not-found skip
        results.set(channelId, '__SKIPPED__');
        continue;
      }

      // CRITICAL: If not-found mark expired but we have attempt tracking, check for escalation
      if (!notFoundData && attemptData && cronType !== 'back-to-back-fix' && cronType !== 'manual') {
        const tracking: AttemptTracking = attemptData;
        
        if (tracking.attempts >= 2 && !tracking.escalated) {
          // This is the third attempt after expiration - escalate immediately
          const programEndTime = await this.getCurrentProgramEndTime(channelId);
          if (programEndTime) {
            tracking.programEndTime = programEndTime;
            tracking.escalated = true;
            const ttlUntilProgramEnd = Math.max(programEndTime - Date.now(), 60);
            await this.redisService.set(notFoundKey, '1', Math.floor(ttlUntilProgramEnd / 1000));
            // Update attempt tracking with program-end TTL
            const ttlUntilProgramEndForTracking = Math.max(programEndTime - Date.now(), 60); // Min 1 minute
            await this.redisService.set(attemptTrackingKey, tracking, Math.floor(ttlUntilProgramEndForTracking / 1000));
            
            const handle = channelHandleMap?.get(channelId) || 'unknown';
            this.logger.warn(`No live video for ${handle} after 3 attempts, marking not-found until program end`);
            
            // Send email notification
            await this.sendEscalationEmail(channelId, handle);
            
            results.set(channelId, '__SKIPPED__');
            continue;
          }
        }
      }
      
      // For back-to-back cron and manual execution, log when we're ignoring not-found flag
      if (notFoundData && (cronType === 'back-to-back-fix' || cronType === 'manual')) {
        const handle = channelHandleMap?.get(channelId) || 'unknown';
        const executionType = cronType === 'back-to-back-fix' ? 'Back-to-back' : 'Manual';
        this.logger.debug(`Ignoring not-found flag for ${handle} (${channelId}) - checking anyway`);
      }

      // Check unified cache
      const cachedStatus = await this.redisService.get<LiveStatusCache>(statusCacheKey);
      if (cachedStatus) {
        try {
          // Skip validation during bulk operations to improve performance for onDemand context
          if (cachedStatus.streams.length > 0 && (context === 'onDemand' || (await this.isVideoLive(cachedStatus.videoId!)))) {
            this.logger.debug(`Reusing cached streams for ${channelId} (${cachedStatus.streamCount} streams)`);
            results.set(channelId, extractLiveStreamsResult(cachedStatus));
            continue;
          } else {
            // If cached streams are invalid, delete them
            await this.redisService.del(statusCacheKey);
            this.logger.debug(`Deleted cached status for ${channelId} (no longer live)`);
          }
        } catch (error) {
          this.logger.warn(`Failed to parse cached status for ${channelId}:`, error);
          await this.redisService.del(statusCacheKey);
        }
      }
      
      // Channel needs fresh fetching
      channelsToFetch.push(channelId);
    }

    // Only fetch channels that don't have valid cached data
    if (channelsToFetch.length === 0) {
      this.logger.debug(`All channels served from cache`);
      return results;
    }

    this.logger.debug(`Fresh fetch for ${channelsToFetch.length}/${channelIds.length} channels`);
    
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
        
        // Track API usage for batch call (this will send individual events for each channel)
        this.logger.debug(`YouTube API batch call for ${chunk.length} channels`);
        
        // Send individual PostHog events for each channel in the batch
        for (const channelId of chunk) {
          // Find the channel handle from the provided mapping
          const handle = channelHandleMap?.get(channelId) || 'unknown';
          
          // Track API usage for this specific channel
          // YouTube API usage tracking removed
        }
        
        const { data } = await axios.get(`${this.apiUrl}/search`, {
          params: {
            part: 'snippet',
            channelId: channelIdsParam,
            eventType: 'live',
            type: 'video',
            key: this.apiKey,
            maxResults: 5, // YouTube API limitation: maxResults should be 1-5 for eventType=live
          },
        });

        this.logger.debug(`YouTube API found ${data.items?.length || 0} live streams for ${chunk.length} channels`);
        if (data.items && data.items.length > 0) {
          // Skip verbose channel and video ID logs - only log count
        } else {
          this.logger.debug(`No live streams found for batch (${chunk.length} channels)`);
          
          // FALLBACK: Try individual requests for channels that failed in batch
          this.logger.debug(`Batch request returned no results, trying individual requests for ${chunk.length} channels`);
          for (const channelId of chunk) {
            try {
              const individualResponse = await axios.get(`${this.apiUrl}/search`, {
                params: {
                  part: 'snippet',
                  channelId: channelId,
                  eventType: 'live',
                  type: 'video',
                  key: this.apiKey,
                  maxResults: 5, // YouTube API limitation: maxResults should be 1-5 for eventType=live
                },
              });
              
              const handle = channelHandleMap?.get(channelId) || 'unknown';
              this.logger.debug(`Individual request for ${handle}: ${individualResponse.data.items?.length || 0} streams found`);
              
              if (individualResponse.data.items && individualResponse.data.items.length > 0) {
                this.logger.debug(`✅ [Individual] Found live stream: ${individualResponse.data.items[0].id.videoId} for ${individualResponse.data.items[0].snippet.channelTitle}`);
                
                // Process the individual result as if it came from batch
                const streams = individualResponse.data.items.map((item: any) => ({
                  videoId: item.id.videoId,
                  title: item.snippet.title,
                  publishedAt: item.snippet.publishedAt,
                  description: item.snippet.description,
                  thumbnailUrl: item.snippet.thumbnails?.medium?.url,
                  channelTitle: item.snippet.channelTitle,
                }));
                
                const liveStreamsResult = {
                  streams,
                  primaryVideoId: streams[0].videoId,
                  streamCount: streams.length
                };
                
                results.set(channelId, liveStreamsResult);
                
                // Unified cache - write LiveStatusCache (replaces liveStreamsByChannel)
                const statusCacheKey = `liveStatusByHandle:${handle}`;
                const notFoundKey = `videoIdNotFound:${handle}`;
                const blockTTL = channelTTLs.get(channelId)!;
                const cacheData = createLiveStatusCacheFromStreams(channelId, handle, liveStreamsResult, blockTTL);
                // Use cacheData.ttl to ensure Redis TTL matches the cache object's TTL field
                await this.redisService.set(statusCacheKey, cacheData, cacheData.ttl);
                
                // Clear the "not-found" flag since we found live streams
                await this.redisService.del(notFoundKey);
                this.logger.debug(`✅ [Individual] Cached ${streams.length} streams for ${handle} (${channelId}) (TTL: ${blockTTL}s)`);
              } else {
                this.logger.debug(`❌ [Individual] No live streams found for ${handle} (${channelId})`);
                
                // For back-to-back-fix cron, only increment attempts without setting new not-found flags
                if (cronType === 'back-to-back-fix') {
                  await this.incrementNotFoundAttempts(channelId, handle);
                  results.set(channelId, null);
                } else if (cronType === 'manual') {
                  // Manual cron should attempt fetch, not skip
                  const notFoundKey = `videoIdNotFound:${handle}`;
                  await this.handleNotFoundEscalationMain(channelId, handle, notFoundKey);
                  results.set(channelId, null);
                } else {
                  // Handle not-found escalation for main cron type
                  const notFoundKey = `videoIdNotFound:${handle}`;
                  await this.handleNotFoundEscalationMain(channelId, handle, notFoundKey);
                  results.set(channelId, '__SKIPPED__');
                }
              }
            } catch (error) {
              this.logger.error(`❌ [Individual] Error testing channel ${channelId}:`, error.message);
              results.set(channelId, null);
            }
          }
        }

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
          const handle = channelHandleMap?.get(channelId) || 'unknown';
          
          if (streams && streams.length > 0) {
            const liveStreamsResult = {
              streams,
              primaryVideoId: streams[0].videoId,
              streamCount: streams.length
            };
            
            results.set(channelId, liveStreamsResult);
            
            // Unified cache - write LiveStatusCache (replaces liveStreamsByChannel)
            const statusCacheKey = `liveStatusByHandle:${handle}`;
            const notFoundKey = `videoIdNotFound:${handle}`;
            const blockTTL = channelTTLs.get(channelId)!;
            const cacheData = createLiveStatusCacheFromStreams(channelId, handle, liveStreamsResult, blockTTL);
            // Use cacheData.ttl to ensure Redis TTL matches the cache object's TTL field
            await this.redisService.set(statusCacheKey, cacheData, cacheData.ttl);
            
            // Clear the "not-found" flag since we found live streams
            await this.redisService.del(notFoundKey);
            this.logger.debug(`💾 [Batch] Cached ${streams.length} streams for ${handle} (${channelId}) (TTL: ${blockTTL}s)`);
        } else {
          // For back-to-back-fix cron, only increment attempts without setting new not-found flags
          if (cronType === 'back-to-back-fix') {
            await this.incrementNotFoundAttempts(channelId, handle);
            results.set(channelId, null);
          } else if (cronType === 'manual') {
            // Manual cron should attempt fetch, not skip
            const notFoundKey = `videoIdNotFound:${handle}`;
            await this.handleNotFoundEscalationMain(channelId, handle, notFoundKey);
            results.set(channelId, null);
          } else {
            // Handle not-found escalation for main cron type
            const notFoundKey = `videoIdNotFound:${handle}`;
            await this.handleNotFoundEscalationMain(channelId, handle, notFoundKey);
            results.set(channelId, '__SKIPPED__');
          }
        }
        }
      }

      this.logger.debug(`[Batch] Completed batch fetch for ${channelsToFetch.length} channels`);
      return results;
      
    } catch (error) {
      this.logger.error(`[Batch] Error in batch fetch:`, error);
      // Return null for all channels on error
      channelIds.forEach(channelId => results.set(channelId, null));
      return results;
    }
  }

  /**
   * Internal method that handles the core logic for getting live streams
   */
  private async getLiveStreamsInternal(
    channelId: string,
    handle: string,
    blockTTL: number,
    context: 'cron' | 'onDemand' | 'program-start',
    ignoreNotFoundCache: boolean = false,
    cronType: 'main' | 'back-to-back-fix' | 'manual'
  ): Promise<LiveStreamsResult | null | '__SKIPPED__'> {
    // gating centralizado
    try {
      if (!(await this.configService.canFetchLive(handle))) {
        this.logger.debug(`[YouTube] fetch skipped for ${handle}`);
        return '__SKIPPED__';
      }
    } catch (error) {
      // If we can't check the config (e.g., database connection issue), assume it can fetch
      this.logger.warn(`⚠️ Error checking fetch config for ${handle}, allowing fetch:`, error.message);
    }

    // Unified cache - use liveStatusByHandle (replaces liveStreamsByChannel)
    const notFoundKey = `videoIdNotFound:${handle}`;
    const statusCacheKey = `liveStatusByHandle:${handle}`;

    // skip rápido si ya está marcado como no-found (unless explicitly ignored)
    if (!ignoreNotFoundCache) {
      if (await this.redisService.get<string>(notFoundKey)) {
        this.logger.debug(`🚫 Skipping ${handle}, marked as not-found`);
        return '__SKIPPED__';
      }
    }

    // cache-hit: reuse si sigue vivo (unified cache)
    const cachedStatus = await this.redisService.get<LiveStatusCache>(statusCacheKey);
    if (cachedStatus) {
      try {
        // Skip validation during bulk operations to improve performance
        // Validate that at least the primary stream is still live (skip for onDemand context)
        if (cachedStatus.streams.length > 0 && cachedStatus.videoId) {
          const shouldValidate = context === 'cron' || context === 'program-start';
          const isValid = shouldValidate ? (await this.isVideoLive(cachedStatus.videoId)) : true;
          
          if (isValid) {
            this.logger.debug(`🔁 Reusing cached streams for ${handle} (${cachedStatus.streamCount} streams)`);
            return extractLiveStreamsResult(cachedStatus);
          } else {
            this.logger.debug(`🔄 Cached video ${cachedStatus.videoId} no longer live for ${handle}, forcing refresh`);
            // Delete cache and continue to make fresh API call
            await this.redisService.del(statusCacheKey);
          }
        }
      } catch (error) {
        this.logger.warn(`Failed to parse cached status for ${handle}:`, error);
        // If parsing fails, delete the corrupted cache
        await this.redisService.del(statusCacheKey);
        this.logger.debug(`🗑️ Deleted corrupted cached status for ${handle}`);
      }
    }

    // Distributed lock per channel to prevent concurrent fetches across replicas
    const channelLockKey = `fetching:${channelId}`;
    const channelLockTTL = 60; // 60 seconds should be enough for API call + processing
    
    const channelLockAcquired = await this.redisService.setNX(channelLockKey, { timestamp: Date.now() }, channelLockTTL);
    if (!channelLockAcquired) {
      this.logger.debug(`⏳ [getLiveStreams] Fetch already in progress for ${handle} (${channelId}), skipping duplicate`);
      return '__SKIPPED__';
    }
    
    // Mark channel as in-flight (in-memory for same-replica deduplication)
    this.inFlightFetches.add(channelId);
    
    // fetch from YouTube
    try {
      // Track API usage
      // YouTube API usage tracking removed
      
      const requestUrl = `${this.apiUrl}/search?part=snippet&channelId=${channelId}&eventType=live&type=video&key=${this.apiKey}&maxResults=5`;
      this.logger.debug(`🔍 [getLiveStreams] Making request for ${handle}: ${requestUrl}`);
      this.logger.debug(`🔍 [getLiveStreams] Using API key: ${this.apiKey ? this.apiKey.substring(0, 10) + '...' : 'NOT_SET'}`);
      
      const { data } = await axios.get(`${this.apiUrl}/search`, {
        params: {
          part: 'snippet',
          channelId,
          eventType: 'live',
          type: 'video',
          key: this.apiKey,
          maxResults: 5, // YouTube API limitation: maxResults should be 1-5 for eventType=live
        },
      });
      
      this.logger.debug(`🔍 [getLiveStreams] Response for ${handle}:`, JSON.stringify(data, null, 2));
      

      const allStreams: LiveStream[] = (data.items || []).map((item: any) => ({
        videoId: item.id.videoId,
        title: item.snippet.title,
        publishedAt: item.snippet.publishedAt,
        description: item.snippet.description,
        thumbnailUrl: item.snippet.thumbnails?.medium?.url,
        channelTitle: item.snippet.channelTitle,
        liveBroadcastContent: item.snippet.liveBroadcastContent, // Add this for validation
      }));

      this.logger.debug(`🔍 [getLiveStreams] Found ${allStreams.length} streams from search API for ${handle}. liveBroadcastContent from search: ${allStreams.map(s => `${s.videoId}:${s.liveBroadcastContent}`).join(', ')}`);

      // Filter out scheduled streams - only keep actually live streams
      const liveStreams: LiveStream[] = [];
      for (const stream of allStreams) {
        this.logger.debug(`🔍 [getLiveStreams] Checking if ${stream.videoId} (${stream.title}) is actually live for ${handle}`);
        const isActuallyLive = await this.isVideoLive(stream.videoId);
        this.logger.debug(`🔍 [getLiveStreams] isVideoLive(${stream.videoId}) returned: ${isActuallyLive}`);
        if (isActuallyLive) {
          liveStreams.push(stream);
          this.logger.debug(`✅ [getLiveStreams] Confirmed live stream for ${handle}: ${stream.videoId} - ${stream.title}`);
        } else {
          this.logger.debug(`⏰ [getLiveStreams] Skipping scheduled stream for ${handle}: ${stream.videoId} - ${stream.title}`);
        }
      }

      if (liveStreams.length === 0) {
        this.logger.debug(`🚫 No actually live streams for ${handle} (${context}) - all were scheduled`);
        if (cronType === 'back-to-back-fix') {
          await this.handleNotFoundEscalationBackToBack(channelId, handle, notFoundKey);
        } else {
          await this.handleNotFoundEscalationMain(channelId, handle, notFoundKey);
        }
        return null;
      }

      const result: LiveStreamsResult = {
        streams: liveStreams,
        primaryVideoId: liveStreams[0].videoId,
        streamCount: liveStreams.length
      };

      // Unified cache - write LiveStatusCache (replaces liveStreamsByChannel)
      const statusCacheKey = `liveStatusByHandle:${handle}`;
      const cacheData = createLiveStatusCacheFromStreams(channelId, handle, result, blockTTL);
      // Use cacheData.ttl to ensure Redis TTL matches the cache object's TTL field
      await this.redisService.set(statusCacheKey, cacheData, cacheData.ttl);
      
      // Clear the "not-found" flag since we found live streams
      await this.redisService.del(notFoundKey);
      this.logger.debug(`📌 Cached ${handle} → ${liveStreams.length} streams (TTL ${blockTTL}s)`);

      // Notify clients about the new streams
      if (context === 'cron') {
        await this.notifyLiveStatusChange(channelId, liveStreams[0].videoId, handle);
      }

      return result;
    } catch (err) {
      const errorMessage = err.message || err;
      this.logger.error(`❌ Error fetching live streams for ${handle}:`, errorMessage);
      
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
    } finally {
      // Always remove from in-flight set, even if there was an error
      this.inFlightFetches.delete(channelId);
    }
  }

  /**
   * Get live streams for main cron - should extend not-found marks
   */
  async getLiveStreamsMain(channelId: string, handle: string, blockTTL: number): Promise<LiveStreamsResult | null | '__SKIPPED__'> {
    return this.getLiveStreamsInternal(channelId, handle, blockTTL, 'cron', false, 'main');
  }

  /**
   * Get live streams for back-to-back-fix cron - should only increment attempts, NOT extend not-found marks
   */
  async getLiveStreamsBackToBack(channelId: string, handle: string, blockTTL: number): Promise<LiveStreamsResult | null | '__SKIPPED__'> {
    return this.getLiveStreamsInternal(channelId, handle, blockTTL, 'cron', true, 'back-to-back-fix');
  }

  /**
   * Get live streams for manual execution - should extend not-found marks
   */
  async getLiveStreamsManual(channelId: string, handle: string, blockTTL: number): Promise<LiveStreamsResult | null | '__SKIPPED__'> {
    return this.getLiveStreamsInternal(channelId, handle, blockTTL, 'cron', false, 'manual');
  }

  public async isVideoLive(videoId: string): Promise<boolean> {
    try {
      // Track API usage
      // YouTube API usage tracking removed
      
      const resp = await axios.get(`${this.apiUrl}/videos`, {
        params: { part: 'snippet', id: videoId, key: this.apiKey },
      });
      return resp.data.items?.[0]?.snippet?.liveBroadcastContent === 'live';
    } catch {
      return false;
    }
  }

  /**
   * Main cron job - runs every hour at :00
   * Should extend not-found marks on second attempt
   */
  async fetchLiveVideoIdsMain() {
    return this.fetchLiveVideoIdsInternal('main', '🕐 MAIN CRON');
  }

  /**
   * Back-to-back fix cron job - runs at :07 and :37
   * Should only increment attempts, NOT extend not-found marks
   */
  async fetchLiveVideoIdsBackToBack() {
    return this.fetchLiveVideoIdsInternal('back-to-back-fix', '🔄 BACK-TO-BACK FIX CRON');
  }

  /**
   * Manual execution method
   */
  async fetchLiveVideoIdsManual() {
    return this.fetchLiveVideoIdsInternal('manual', '🔧 MANUAL EXECUTION');
  }

  /**
   * Internal method that handles the actual logic for all cron types
   */
  private async fetchLiveVideoIdsInternal(cronType: 'main' | 'back-to-back-fix' | 'manual', cronLabel: string) {
    const currentTime = TimezoneUtil.currentTimeString();
    
    // Distributed lock to prevent multiple replicas from running simultaneously
    const lockKey = `cron:${cronType}:lock`;
    const lockTTL = 120; // 2 minutes - should be enough for the cron to complete
    
    const acquired = await this.redisService.setNX(lockKey, { timestamp: Date.now() }, lockTTL);
    
    if (!acquired) {
      this.logger.debug(`${cronLabel} - Skipping (another replica already running)`);
      return;
    }
    
    this.logger.debug(`${cronLabel} started at ${currentTime}`);
    
    const today = TimezoneUtil.currentDayOfWeek();
  
    // 1) Get schedules for today, filtered by visible channels only
    // Use findAll with applyOverrides=true to include weekly overrides (same as API endpoints)
    const rawSchedules = await this.schedulesService.findAll({ 
      dayOfWeek: today, 
      applyOverrides: true,
      liveStatus: false // Don't enrich with live status yet, we'll do that after filtering
    });
    const schedules = rawSchedules; // findAll already includes enrichment
    
    // Filter out schedules from non-visible channels
    const visibleSchedules = schedules.filter(s => s.program.channel?.is_visible === true);
  
    // 2) Filter only schedules that are "on-air" right now (time-based, not YouTube live status)
    // CRITICAL: Only process schedules that have actual programs (not ghost schedules)
    const currentNum = TimezoneUtil.currentTimeInMinutes();
    const liveNow = visibleSchedules.filter(s => {
      // Must have a valid program with a name
      if (!s.program || !s.program.name || s.program.name.trim() === '') {
        return false;
      }
      
      // Must have valid start and end times
      if (!s.start_time || !s.end_time) {
        return false;
      }
      
      // Check if schedule is currently live based on time (time-based, not YouTube live status)
      const startNum = this.convertTimeToMinutes(s.start_time);
      const endNum = this.convertTimeToMinutes(s.end_time);
      return s.day_of_week === today && currentNum >= startNum && currentNum < endNum;
    });
  
    // 3) Deduplicás canales de esos schedules
    const map = new Map<string,string>();
    for (const s of liveNow) {
      const ch = s.program.channel;
      if (ch?.youtube_channel_id && ch.handle) {
        map.set(ch.youtube_channel_id, ch.handle);
      }
    }
  
    this.logger.debug(`${cronLabel}: ${visibleSchedules.length}/${liveNow.length} visible/live, refreshing ${map.size} channels`);
    
    if (map.size === 0) {
      this.logger.debug(`${cronLabel} - No live channels to refresh`);
      return;
    }
    
    const results = new Map<string, any>();
    
    // Process each channel individually
    for (const [channelId, handle] of map.entries()) {
      try {
        // Calculate TTL for this channel
        const ttl = await getCurrentBlockTTL(channelId, rawSchedules, this.sentryService);
        
        // Fetch live streams for this channel using the appropriate method based on cron type
        let liveStreamsResult;
        if (cronType === 'back-to-back-fix') {
          liveStreamsResult = await this.getLiveStreamsBackToBack(channelId, handle, ttl);
        } else {
          liveStreamsResult = await this.getLiveStreamsMain(channelId, handle, ttl);
        }
        
        if (liveStreamsResult && liveStreamsResult !== '__SKIPPED__' && liveStreamsResult.streamCount > 0) {
          results.set(channelId, liveStreamsResult);
        }
        
        // Small delay between requests to be respectful to YouTube API
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        this.logger.error(`[${cronLabel}] Error fetching live status for ${handle}:`, error.message);
      }
    }
    
    // Log summary
    const liveCount = Array.from(results.values()).filter(r => r && r.streamCount > 0).length;
    this.logger.debug(`${cronLabel} completed - ${liveCount}/${map.size} channels live`);
  }


  /**
   * Check for programs starting right now and validate cached video IDs
   * This catches back-to-back program transitions where video IDs might change
   */
  async checkProgramStarts() {
    try {
      const now = TimezoneUtil.now();
      const currentMinute = now.format('HH:mm');
      const currentDay = TimezoneUtil.currentDayOfWeek();
      
      // Find programs starting right now
      const startingPrograms = await this.schedulesService.findByStartTime(currentDay, currentMinute);
      
      if (startingPrograms.length === 0) {
        return; // No programs starting
      }

      this.logger.debug(`🎬 Program start detection: ${startingPrograms.length} programs starting at ${currentMinute}`);
      
      // Group by channel to avoid duplicate API calls
      const channelMap = new Map<string, string>();
      for (const program of startingPrograms) {
        if (program.program.channel?.youtube_channel_id && program.program.channel?.handle) {
          channelMap.set(program.program.channel.youtube_channel_id, program.program.channel.handle);
        }
      }

      // Validate cached video IDs for channels with starting programs
      // Force validation (bypass cooldown) since a new program is starting
      for (const [channelId, handle] of channelMap.entries()) {
        await this.validateCachedVideoId(channelId, handle, true);
      }

      // Schedule a follow-up check 7 minutes later for delayed starts
      setTimeout(async () => {
        await this.checkDelayedProgramStarts(startingPrograms);
      }, 7 * 60 * 1000); // 7 minutes

    } catch (error) {
      this.logger.error('Error in program start detection:', error);
      this.sentryService.captureException(error);
    }
  }

  /**
   * Follow-up check 7 minutes after program start to catch delayed video ID changes
   */
  private async checkDelayedProgramStarts(programs: any[]) {
    try {
      this.logger.debug(`🔄 Delayed program start check: validating ${programs.length} programs`);
      
      // Group by channel to avoid duplicate API calls
      const channelMap = new Map<string, string>();
      for (const program of programs) {
        if (program.program.channel?.youtube_channel_id && program.program.channel?.handle) {
          channelMap.set(program.program.channel.youtube_channel_id, program.program.channel.handle);
        }
      }

      // Validate cached video IDs for channels with starting programs
      // Force validation (bypass cooldown) for delayed check
      for (const [channelId, handle] of channelMap.entries()) {
        await this.validateCachedVideoId(channelId, handle, true);
      }
    } catch (error) {
      this.logger.error('Error in delayed program start check:', error);
      this.sentryService.captureException(error);
    }
  }

  /**
   * Validate if cached video ID is still live and refresh if needed
   * @param channelId YouTube channel ID
   * @param handle Channel handle  
   * @param forceFresh Force validation even if cooldown is active (used for program transitions)
   */
  private async validateCachedVideoId(channelId: string, handle: string, forceFresh: boolean = false) {
    try {
      // Check cooldown to prevent excessive API calls (unless forced)
      const now = Date.now();
      const lastValidation = this.validationCooldowns.get(channelId);
      
      if (!forceFresh && lastValidation && (now - lastValidation) < this.COOLDOWN_PERIOD) {
        this.logger.debug(`⏳ Skipping validation for ${handle} (cooldown active)`);
        return;
      }
      
      if (forceFresh && lastValidation && (now - lastValidation) < this.COOLDOWN_PERIOD) {
        this.logger.debug(`🔄 Forcing validation for ${handle} despite cooldown (program transition)`);
      }

      // Unified cache - Check liveStatusByHandle (replaces liveStreamsByChannel)
      const statusCacheKey = `liveStatusByHandle:${handle}`;
      const cachedStatus = await this.redisService.get<LiveStatusCache>(statusCacheKey);
      
      if (!cachedStatus || !cachedStatus.videoId) {
        return; // No cached data to validate
      }

      // Check if cached streams are still live
      try {
        if (cachedStatus.videoId && (await this.isVideoLive(cachedStatus.videoId))) {
          this.logger.debug(`✅  ${handle}: ${cachedStatus.videoId}`);
          this.validationCooldowns.set(channelId, now); // Update cooldown
          return; // Still live, no action needed
        }
      } catch (error) {
        this.logger.warn(`Failed to validate cached status for ${handle}:`, error);
      }

      // Video ID/streams are no longer live, refresh them
      const oldVideoId = cachedStatus.videoId;
      this.logger.debug(`🔄 Cached video ID no longer live for ${handle} (${oldVideoId}), refreshing...`);
      
      const schedules = await this.schedulesService.findByDay(dayjs().tz('America/Argentina/Buenos_Aires').format('dddd').toLowerCase());
      const ttl = await getCurrentBlockTTL(channelId, schedules, this.sentryService);
      
      // Use the main cron method to refresh (should extend not-found marks)
      const streamsResult = await this.getLiveStreamsMain(channelId, handle, ttl);
      
      if (streamsResult && streamsResult !== '__SKIPPED__') {
        if (oldVideoId && oldVideoId !== streamsResult.primaryVideoId) {
          this.logger.debug(`🔄 Video ID rotated for ${handle}: ${oldVideoId} → ${streamsResult.primaryVideoId} (SSE notification sent)`);
        } else {
          this.logger.debug(`🆕 Refreshed streams for ${handle}: ${streamsResult.streamCount} streams, primary: ${streamsResult.primaryVideoId}`);
        }
      } else {
        // Clear status cache if no streams found
        await this.redisService.del(statusCacheKey);
        this.logger.debug(`🗑️ Cleared status cache for ${handle} (no streams found)`);
      }

      // Update cooldown after validation
      this.validationCooldowns.set(channelId, now);
      
    } catch (error) {
      this.logger.error(`Error validating cached video ID for ${handle}:`, error);
      this.sentryService.captureException(error);
    }
  }

  /**
   * Increment not-found attempts without setting new not-found flags (for back-to-back-fix cron)
   */
  private async incrementNotFoundAttempts(channelId: string, handle: string): Promise<void> {
    const attemptTrackingKey = `notFoundAttempts:${handle}`;
    const existing = await this.redisService.get<AttemptTracking>(attemptTrackingKey);
    
    if (existing) {
      const tracking: AttemptTracking = existing;
      tracking.attempts += 1;
      tracking.lastAttempt = Date.now();
      
      // Update attempt tracking with program-end TTL (without setting new not-found flags)
      const programEndTime = await this.getCurrentProgramEndTime(channelId);
      const ttlUntilProgramEnd = programEndTime ? Math.max(programEndTime - Date.now(), 60) : 86400; // Min 1 minute, fallback to 24h
      await this.redisService.set(attemptTrackingKey, tracking, Math.floor(ttlUntilProgramEnd / 1000));
      
      this.logger.debug(`🔄 [Back-to-back] Incremented attempt count for ${handle} (${channelId}) - now ${tracking.attempts} attempts`);
    } else {
      // If no existing tracking, this shouldn't happen for back-to-back cron, but handle gracefully
      this.logger.debug(`⚠️ [Back-to-back] No attempt tracking found for ${handle} (${channelId}) - this shouldn't happen`);
    }
  }

  /**
   * Handle not-found escalation for main cron and manual execution - should extend not-found marks
   */
  private async handleNotFoundEscalationMain(
    channelId: string, 
    handle: string, 
    notFoundKey: string
  ): Promise<void> {
    const attemptTrackingKey = `notFoundAttempts:${handle}`;
    const existing = await this.redisService.get<AttemptTracking>(attemptTrackingKey);
    
    if (!existing) {
      // First attempt
      const tracking: AttemptTracking = {
        attempts: 1,
        firstAttempt: Date.now(),
        lastAttempt: Date.now(),
        escalated: false
      };
      
      // Set persistent tracking with program-end TTL
      const programEndTime = await this.getCurrentProgramEndTime(channelId);
      const ttlUntilProgramEnd = programEndTime ? Math.max(programEndTime - Date.now(), 60) : 86400; // Min 1 minute, fallback to 24h
      await this.redisService.set(attemptTrackingKey, tracking, Math.floor(ttlUntilProgramEnd / 1000));
      
      // Phase 4: Set not-found mark for main cron and manual execution - both formats
      await this.redisService.set(notFoundKey, '1', 900);
      await this.redisService.set(`videoIdNotFound:${handle}`, '1', 900);
      this.logger.debug(`🚫 [First attempt] No live video for ${handle}, marking not-found for 15 minutes`);
      return;
    }

    const tracking: AttemptTracking = existing;
    tracking.attempts++;
    tracking.lastAttempt = Date.now();

    if (tracking.attempts >= 3) {
      // Third attempt - escalate to program duration
      const programEndTime = await this.getCurrentProgramEndTime(channelId);
      if (programEndTime) {
        tracking.programEndTime = programEndTime;
        tracking.escalated = true;
        const ttlUntilProgramEnd = Math.max(programEndTime - Date.now(), 60);
        await this.redisService.set(notFoundKey, '1', Math.floor(ttlUntilProgramEnd / 1000));
        await this.redisService.set(`videoIdNotFound:${handle}`, '1', Math.floor(ttlUntilProgramEnd / 1000));
        
        // Update attempt tracking with program-end TTL
        const ttlUntilProgramEndForTracking = Math.max(programEndTime - Date.now(), 60); // Min 1 minute
        await this.redisService.set(attemptTrackingKey, tracking, Math.floor(ttlUntilProgramEndForTracking / 1000));
        
        this.logger.debug(`🚫 [ESCALATED] No live video for ${handle} after 3 attempts, marking not-found until program end (${new Date(programEndTime).toLocaleTimeString()})`);
        
        // Send email notification
        await this.sendEscalationEmail(channelId, handle);
      } else {
        // Fallback to 1 hour - both formats
        await this.redisService.set(notFoundKey, '1', 3600);
        await this.redisService.set(`videoIdNotFound:${handle}`, '1', 3600);
        this.logger.debug(`🚫 [Fallback] No live video for ${handle}, marking not-found for 1 hour (couldn't determine program end)`);
      }
    } else {
      // Second attempt - extend not-found mark for main cron and manual execution - both formats
      await this.redisService.set(notFoundKey, '1', 900);
      await this.redisService.set(`videoIdNotFound:${handle}`, '1', 900);
      this.logger.debug(`🚫 [Second attempt] Still no live video for ${handle}, extending not-found for another 15 minutes`);
    }
    
    // Update persistent tracking with program-end TTL
    const programEndTime = await this.getCurrentProgramEndTime(channelId);
    const ttlUntilProgramEnd = programEndTime ? Math.max(programEndTime - Date.now(), 60) : 86400; // Min 1 minute, fallback to 24h
    await this.redisService.set(attemptTrackingKey, tracking, Math.floor(ttlUntilProgramEnd / 1000));
  }

  /**
   * Handle not-found escalation for back-to-back-fix cron - should only increment attempts, NOT extend not-found marks
   */
  private async handleNotFoundEscalationBackToBack(
    channelId: string, 
    handle: string, 
    notFoundKey: string
  ): Promise<void> {
    const attemptTrackingKey = `notFoundAttempts:${handle}`;
    const existing = await this.redisService.get<AttemptTracking>(attemptTrackingKey);
    
    if (!existing) {
      // First attempt - only increment attempts, no not-found mark
      const tracking: AttemptTracking = {
        attempts: 1,
        firstAttempt: Date.now(),
        lastAttempt: Date.now(),
        escalated: false
      };
      
      // Set persistent tracking with program-end TTL
      const programEndTime = await this.getCurrentProgramEndTime(channelId);
      const ttlUntilProgramEnd = programEndTime ? Math.max(programEndTime - Date.now(), 60) : 86400; // Min 1 minute, fallback to 24h
      await this.redisService.set(attemptTrackingKey, tracking, Math.floor(ttlUntilProgramEnd / 1000));
      
      this.logger.debug(`🚫 [Back-to-back] First attempt for ${handle}, incrementing attempts only (no not-found mark)`);
      return;
    }

    const tracking: AttemptTracking = existing;
    tracking.attempts++;
    tracking.lastAttempt = Date.now();

    if (tracking.attempts >= 3) {
      // Third attempt - escalate to program duration
      const programEndTime = await this.getCurrentProgramEndTime(channelId);
      if (programEndTime) {
        tracking.programEndTime = programEndTime;
        tracking.escalated = true;
        const ttlUntilProgramEnd = Math.max(programEndTime - Date.now(), 60);
        await this.redisService.set(notFoundKey, '1', Math.floor(ttlUntilProgramEnd / 1000));
        await this.redisService.set(`videoIdNotFound:${handle}`, '1', Math.floor(ttlUntilProgramEnd / 1000));
        
        // Update attempt tracking with program-end TTL
        const ttlUntilProgramEndForTracking = Math.max(programEndTime - Date.now(), 60); // Min 1 minute
        await this.redisService.set(attemptTrackingKey, tracking, Math.floor(ttlUntilProgramEndForTracking / 1000));
        
        this.logger.debug(`🚫 [ESCALATED] No live video for ${handle} after 3 attempts, marking not-found until program end (${new Date(programEndTime).toLocaleTimeString()})`);
        
        // Send email notification
        await this.sendEscalationEmail(channelId, handle);
      } else {
        // Fallback to 1 hour - both formats
        await this.redisService.set(notFoundKey, '1', 3600);
        await this.redisService.set(`videoIdNotFound:${handle}`, '1', 3600);
        this.logger.debug(`🚫 [Fallback] No live video for ${handle}, marking not-found for 1 hour (couldn't determine program end)`);
      }
    } else {
      // Second attempt - only increment attempts, no not-found mark renewal
      this.logger.debug(`🚫 [Back-to-back] Second attempt for ${handle}, incrementing attempts only (no not-found mark renewal)`);
    }
    
    // Update persistent tracking with program-end TTL
    const programEndTime = await this.getCurrentProgramEndTime(channelId);
    const ttlUntilProgramEnd = programEndTime ? Math.max(programEndTime - Date.now(), 60) : 86400; // Min 1 minute, fallback to 24h
    await this.redisService.set(attemptTrackingKey, tracking, Math.floor(ttlUntilProgramEnd / 1000));
  }

  /**
   * Get current program end time for a channel
   */
  private async getCurrentProgramEndTime(channelId: string): Promise<number | null> {
    try {
      const currentDay = TimezoneUtil.currentDayOfWeek();
      const currentTimeInMinutes = TimezoneUtil.currentTimeInMinutes();
      
      // Get schedules for this channel
      const schedules = await this.schedulesService.findAll({
        dayOfWeek: currentDay,
        liveStatus: false,
        applyOverrides: true,
      });

      // Find current program for this channel
      const currentProgram = schedules.find(schedule => {
        const channelIdFromSchedule = schedule.program?.channel?.youtube_channel_id;
        if (channelIdFromSchedule !== channelId) return false;
        
        const startMinutes = this.convertTimeToMinutes(schedule.start_time);
        const endMinutes = this.convertTimeToMinutes(schedule.end_time);
        return startMinutes <= currentTimeInMinutes && endMinutes > currentTimeInMinutes;
      });
      
      if (currentProgram) {
        const endMinutes = this.convertTimeToMinutes(currentProgram.end_time);
        const endMoment = TimezoneUtil.todayAtTime(`${Math.floor(endMinutes / 60).toString().padStart(2, '0')}:${(endMinutes % 60).toString().padStart(2, '0')}`);
        return endMoment.valueOf();
      }
      
      return null;
    } catch (error) {
      this.logger.error('Error getting program end time:', error);
      return null;
    }
  }

  /**
   * Sync liveStatusByHandle cache from liveStreamsByChannel data
   * This ensures both cache keys stay in sync when streams are updated
   */
  private async syncLiveStatusCacheFromStreams(
    channelId: string,
    handle: string,
    streamsResult: LiveStreamsResult,
    ttl: number
  ): Promise<void> {
    try {
      // Calculate blockEndTime by checking current schedules
      // Default to end of day if we can't determine it (background service will correct it)
      let blockEndTime = 24 * 60; // End of day in minutes
      
      try {
        const currentDay = TimezoneUtil.currentDayOfWeek();
        const currentTimeInMinutes = TimezoneUtil.currentTimeInMinutes();
        
        const schedules = await this.schedulesService.findAll({
          dayOfWeek: currentDay,
          liveStatus: false,
          applyOverrides: true,
        });
        
        const channelSchedules = schedules.filter(
          s => s.program?.channel?.youtube_channel_id === channelId
        );
        
        const liveSchedules = channelSchedules.filter(schedule => {
          const startNum = this.convertTimeToMinutes(schedule.start_time);
          const endNum = this.convertTimeToMinutes(schedule.end_time);
          return currentTimeInMinutes >= startNum && currentTimeInMinutes < endNum;
        });
        
        if (liveSchedules.length > 0) {
          // Find the latest end time among live schedules
          blockEndTime = Math.max(
            ...liveSchedules.map(s => this.convertTimeToMinutes(s.end_time))
          );
        }
      } catch (error) {
        // If we can't calculate blockEndTime, use default (background service will fix it)
        this.logger.debug(`[SYNC] Could not calculate blockEndTime for ${handle}, using default`);
      }
      
      // Create LiveStatusCache object matching the structure expected by background service
      const statusCache = {
        channelId,
        handle,
        isLive: streamsResult.streams && streamsResult.streams.length > 0,
        streamUrl: streamsResult.streams && streamsResult.streams.length > 0 
          ? `https://www.youtube.com/embed/${streamsResult.primaryVideoId}?autoplay=1`
          : null,
        videoId: streamsResult.primaryVideoId || null,
        lastUpdated: Date.now(),
        ttl,
        blockEndTime,
        validationCooldown: Date.now() + (30 * 60 * 1000), // 30 min cooldown
        lastValidation: Date.now(),
        streams: streamsResult.streams || [],
        streamCount: streamsResult.streamCount || 0,
      };
      
      // Write to liveStatusByHandle cache
      const statusCacheKey = `liveStatusByHandle:${handle}`;
      await this.redisService.set(statusCacheKey, statusCache, ttl);
      
      this.logger.debug(`[SYNC] Synced liveStatusByHandle for ${handle} (isLive: ${statusCache.isLive})`);
    } catch (error) {
      // Log but don't throw - this is a sync operation, shouldn't break the main flow
      this.logger.warn(`[SYNC] Failed to sync liveStatusByHandle for ${handle}:`, error.message);
    }
  }

  /**
   * Convert time string to minutes
   */
  private convertTimeToMinutes(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Send escalation email notification
   */
  private async sendEscalationEmail(channelId: string, handle: string): Promise<void> {
    // Only send emails in production environment
    if (process.env.NODE_ENV !== 'asd') {
      this.logger.debug(`📧 [${process.env.NODE_ENV || 'development'}] Escalation email skipped for ${handle} (not production environment)`);
      return;
    }

    try {
      // Get channel and program information
      const channel = await this.channelsRepository.findOne({
        where: { youtube_channel_id: channelId },
        relations: ['programs']
      });

      if (!channel) {
        this.logger.error(`Channel not found for ID: ${channelId}`);
        return;
      }

      const currentDay = TimezoneUtil.currentDayOfWeek();
      const currentTimeInMinutes = TimezoneUtil.currentTimeInMinutes();
      
      // Find current program
      const schedules = await this.schedulesService.findAll({
        dayOfWeek: currentDay,
        liveStatus: false,
        applyOverrides: true,
      });

      const currentProgram = schedules.find(schedule => {
        const channelIdFromSchedule = schedule.program?.channel?.youtube_channel_id;
        if (channelIdFromSchedule !== channelId) return false;
        
        const startMinutes = this.convertTimeToMinutes(schedule.start_time);
        const endMinutes = this.convertTimeToMinutes(schedule.end_time);
        return startMinutes <= currentTimeInMinutes && endMinutes > currentTimeInMinutes;
      });

      const programName = currentProgram?.program?.name || 'Programa desconocido';
      const channelName = channel.name;

      const subject = `🚨 Programa marcado como no encontrado - ${programName}`;
      const htmlContent = `
        <h2>🚨 Alerta de Programa No Encontrado</h2>
        <p>El programa <strong>${programName}</strong> del canal <strong>${channelName}</strong> ha sido marcado como no encontrado después de 3 intentos fallidos de encontrar el video ID en vivo.</p>
        
        <h3>Detalles:</h3>
        <ul>
          <li><strong>Canal:</strong> ${channelName} (${handle})</li>
          <li><strong>Programa:</strong> ${programName}</li>
          <li><strong>Hora:</strong> ${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}</li>
          <li><strong>Estado:</strong> Marcado como no encontrado hasta el final del programa</li>
        </ul>
        
        <p>El sistema dejará de hacer llamadas a la API de YouTube para este programa hasta que termine su horario programado.</p>
        
        <p>Si necesitas verificar manualmente el estado del programa, puedes usar el botón de actualización en el backoffice.</p>
      `;

      await this.emailService.sendEmail({
        to: 'admin@laguiadelstreaming.com',
        subject,
        html: htmlContent,
      });

      this.logger.debug(`📧 Email de escalación enviado para ${programName} (${channelName})`);
    } catch (error) {
      this.logger.error('Error sending escalation email:', error);
      this.sentryService.captureException(error);
    }
  }
}

