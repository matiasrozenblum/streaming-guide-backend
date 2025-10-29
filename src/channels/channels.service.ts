import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Channel } from './channels.entity';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { Program } from '@/programs/programs.entity';
import { Schedule } from '@/schedules/schedules.entity';
import { SchedulesService } from '@/schedules/schedules.service';
import { RedisService } from '@/redis/redis.service';
import { YoutubeDiscoveryService } from '@/youtube/youtube-discovery.service';
import { UserSubscription } from '@/users/user-subscription.entity';
import { Device } from '@/users/device.entity';
import { User } from '@/users/users.entity';
import { NotifyAndRevalidateUtil } from '../utils/notify-and-revalidate.util';
import { ConfigService } from '@/config/config.service';
import { WeeklyOverridesService } from '@/schedules/weekly-overrides.service';
import { YoutubeLiveService } from '@/youtube/youtube-live.service';
import { OptimizedSchedulesService } from '@/youtube/optimized-schedules.service';
import { getCurrentBlockTTL } from '@/utils/getBlockTTL.util';
import { TimezoneUtil } from '../utils/timezone.util';
import { Category } from '../categories/categories.entity';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://staging.laguiadelstreaming.com';
const REVALIDATE_SECRET = process.env.REVALIDATE_SECRET || 'changeme';

type ChannelWithSchedules = {
  channel: {
    id: number;
    name: string;
    logo_url: string | null;
    stream_count?: number;
    categories?: Array<{
      id: number;
      name: string;
      description?: string;
      color?: string;
      order?: number;
    }>;
  };
  schedules: Array<{
    id: number;
    day_of_week: string;
    start_time: string;
    end_time: string;
    subscribed: boolean;
    isWeeklyOverride: boolean;
    overrideType: string;
    program: {
      id: number;
      name: string;
      logo_url: string | null;
      description: string | null;
      stream_url: string | null;
      is_live: boolean;
      live_streams?: any[] | null;
      stream_count?: number;
      channel_stream_count?: number;
      panelists: { id: string; name: string }[];
      style_override: string | null;
    };
  }>;
};

@Injectable()
export class ChannelsService {
  private notifyUtil: NotifyAndRevalidateUtil;
  private dayjs: typeof dayjs;

  constructor(
    @InjectRepository(Channel)
    private readonly channelsRepository: Repository<Channel>,
    @InjectRepository(Program)
    private readonly programsRepository: Repository<Program>,
    @InjectRepository(Schedule)
    private readonly scheduleRepo: Repository<Schedule>,
    @InjectRepository(UserSubscription)
    private readonly userSubscriptionRepo: Repository<UserSubscription>,
    @InjectRepository(Device)
    private readonly deviceRepo: Repository<Device>,
    @InjectRepository(Category)
    private readonly categoriesRepository: Repository<Category>,
    private readonly dataSource: DataSource,
    private readonly schedulesService: SchedulesService,
    private readonly redisService: RedisService,
    private readonly youtubeDiscovery: YoutubeDiscoveryService,
    private readonly configService: ConfigService,
    private readonly weeklyOverridesService: WeeklyOverridesService,
    private readonly youtubeLiveService: YoutubeLiveService,
    private readonly optimizedSchedulesService: OptimizedSchedulesService,
  ) {
    this.dayjs = dayjs;
    this.dayjs.extend(utc);
    this.dayjs.extend(timezone);
    this.notifyUtil = new NotifyAndRevalidateUtil(
      this.redisService,
      FRONTEND_URL,
      REVALIDATE_SECRET
    );
  }

  async findAll(): Promise<Channel[]> {
    return this.channelsRepository.find({
      relations: ['categories'],
      order: {
        order: 'ASC',
      },
    });
  }

  async findOne(id: number): Promise<Channel> {
    const channel = await this.channelsRepository.findOne({ 
      where: { id },
      relations: ['categories']
    });
    if (!channel) {
      throw new NotFoundException(`Channel with ID ${id} not found`);
    }
    return channel;
  }

  async create(createChannelDto: CreateChannelDto): Promise<Channel> {
    const lastChannel = await this.channelsRepository
      .createQueryBuilder('channel')
      .where('channel.order IS NOT NULL')
      .orderBy('channel.order', 'DESC')
      .getOne();
  
    const newOrder = lastChannel ? (lastChannel.order || 0) + 1 : 1;
  
    const { category_ids, ...channelData } = createChannelDto;
    
    const channel = this.channelsRepository.create({
      ...channelData,
      order: newOrder,
    });

    // Load categories if provided
    if (category_ids && category_ids.length > 0) {
      const categories = await this.categoriesRepository.findByIds(category_ids);
      channel.categories = categories;
    }
  
    // Clear unified cache
    try {
      await this.redisService.del('schedules:week:complete');
      await this.redisService.del('channels:visible_with_categories');
    } catch (error) {
      console.error('❌ Error clearing caches:', error.message);
    }
    
    // Warm cache asynchronously (non-blocking)
    setImmediate(() => this.schedulesService.warmSchedulesCache());
    
    const saved = await this.channelsRepository.save(channel);

    const info = await this.youtubeDiscovery.getChannelIdFromHandle(createChannelDto.handle);
    if (info) {
      saved.youtube_channel_id = info.channelId;
      await this.channelsRepository.save(saved);
    }

    // Notify and revalidate
    await this.notifyUtil.notifyAndRevalidate({
      eventType: 'channel_created',
      entity: 'channel',
      entityId: saved.id,
      payload: { channel: saved },
      revalidatePaths: ['/'],
    });

    return saved;
  }

  async update(id: number, updateChannelDto: UpdateChannelDto): Promise<Channel> {
    const channel = await this.findOne(id);
    
    const { category_ids, ...channelData } = updateChannelDto;
    
    // Check if handle is being updated
    const handleChanged = channelData.handle !== undefined && channelData.handle !== channel.handle;
    
    Object.keys(channelData).forEach((key) => {
      if (channelData[key] !== undefined) {
        channel[key] = channelData[key];
      }
    });

    // Handle categories update
    if (category_ids !== undefined) {
      if (category_ids.length > 0) {
        const categories = await this.categoriesRepository.findByIds(category_ids);
        channel.categories = categories;
      } else {
        channel.categories = [];
      }
    }

    // Clear unified cache
    try {
      await this.redisService.del('schedules:week:complete');
      await this.redisService.del('channels:visible_with_categories');
    } catch (error) {
      console.error('❌ Error clearing caches:', error.message);
    }
    
    // Warm cache asynchronously (non-blocking)
    setImmediate(() => this.schedulesService.warmSchedulesCache());
    
    const updated = await this.channelsRepository.save(channel);

    // Update YouTube channel ID if handle changed
    if (handleChanged && updateChannelDto.handle) {
      const oldYoutubeChannelId = channel.youtube_channel_id;
      const oldHandle = channel.handle; // Old handle for cache invalidation
      
      try {
        const info = await this.youtubeDiscovery.getChannelIdFromHandle(updateChannelDto.handle);
        if (info) {
          const newYoutubeChannelId = info.channelId;
          
          updated.youtube_channel_id = info.channelId;
          await this.channelsRepository.save(updated);
          console.log(`🔄 Updated YouTube channel ID for ${updated.name}: ${info.channelId}`);
          
          // Invalidate old live status caches when YouTube channel ID changes
          if (oldYoutubeChannelId && oldYoutubeChannelId !== newYoutubeChannelId) {
            await this.invalidateLiveStatusCaches(oldHandle);
            console.log(`🗑️ Invalidated live status caches for old YouTube channel ID: ${oldYoutubeChannelId}`);
          }
        } else {
          console.log(`⚠️ Could not resolve YouTube channel ID for handle: ${updateChannelDto.handle}`);
          // Still invalidate old cache even if new channel ID resolution fails
          if (oldYoutubeChannelId) {
            await this.invalidateLiveStatusCaches(oldHandle);
            console.log(`🗑️ Invalidated live status caches for old YouTube channel ID: ${oldYoutubeChannelId}`);
          }
        }
      } catch (error) {
        console.error(`❌ Error updating YouTube channel ID for ${updated.name}:`, error.message);
        // Still invalidate old cache even if there's an error
        if (oldYoutubeChannelId) {
          await this.invalidateLiveStatusCaches(oldHandle);
          console.log(`🗑️ Invalidated live status caches for old YouTube channel ID: ${oldYoutubeChannelId}`);
        }
      }
    }

    // Notify and revalidate
    await this.notifyUtil.notifyAndRevalidate({
      eventType: 'channel_updated',
      entity: 'channel',
      entityId: updated.id,
      payload: { channel: updated },
      revalidatePaths: ['/'],
    });

    return updated;
  }

  async remove(id: number): Promise<void> {
    const result = await this.channelsRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Channel with ID ${id} not found`);
    }
    
    // Clear unified cache
    try {
      await this.redisService.del('schedules:week:complete');
      await this.redisService.del('channels:visible_with_categories');
    } catch (error) {
      console.error('❌ Error clearing caches:', error.message);
    }
    
    // Warm cache asynchronously (non-blocking)
    setImmediate(() => this.schedulesService.warmSchedulesCache());

    // Notify and revalidate
    await this.notifyUtil.notifyAndRevalidate({
      eventType: 'channel_deleted',
      entity: 'channel',
      entityId: id,
      payload: {},
      revalidatePaths: ['/'],
    });
  }

  async reorder(channelIds: number[]): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      for (let i = 0; i < channelIds.length; i++) {
        await manager.update(Channel, channelIds[i], { order: i + 1 });
      }
    });
    
    // Clear unified cache
    try {
      await this.redisService.del('schedules:week:complete');
      await this.redisService.del('channels:visible_with_categories');
    } catch (error) {
      console.error('❌ Error clearing caches:', error.message);
    }
    
    // Warm cache asynchronously (non-blocking)
    setImmediate(() => this.schedulesService.warmSchedulesCache());

    // Notify and revalidate
    await this.notifyUtil.notifyAndRevalidate({
      eventType: 'channels_reordered',
      entity: 'channel',
      entityId: 'all',
      payload: { channelIds },
      revalidatePaths: ['/'],
    });
  }

  async getChannelsWithSchedules(day?: string, deviceId?: string, liveStatus?: boolean, raw?: string): Promise<ChannelWithSchedules[]> {
    const overallStart = Date.now();
    const requestId = Math.random().toString(36).substr(2, 9);
    console.log(`[CHANNELS-SCHEDULES-${requestId}] Starting fetch - day: ${day || 'all'}, live: ${liveStatus}, raw: ${raw} at ${new Date().toISOString()}`);

    // Pre-fetch user subscriptions if deviceId is provided (optimized query)
    let subscribedProgramIds: Set<number> = new Set();
    if (deviceId) {
      try {
        // Use optimized query to avoid complex JOINs
        const device = await this.deviceRepo
          .createQueryBuilder('device')
          .leftJoinAndSelect('device.user', 'user')
          .select(['device.id', 'user.id'])
          .where('device.deviceId = :deviceId', { deviceId })
          .getOne();
        
        if (device?.user?.id) {
          const subscriptions = await this.userSubscriptionRepo.find({
            where: { user: { id: device.user.id }, isActive: true },
            relations: ['program'],
          });
          subscribedProgramIds = new Set(subscriptions.map(sub => sub.program.id));
        }
      } catch (error) {
        console.warn(`[CHANNELS-SCHEDULES] Device lookup failed for ${deviceId}:`, error.message);
        // Continue without device filtering if lookup fails
      }
    }

    // Use Approach B: cache combination for better performance
    const queryStart = Date.now();
    console.log(`[CHANNELS-SCHEDULES-${requestId}] Using cache combination approach at ${new Date().toISOString()}`);
    let allSchedules;
    try {
      // Get data from OptimizedSchedulesService (combines schedules + liveStatus + overrides)
      allSchedules = await this.optimizedSchedulesService.getSchedulesWithOptimizedLiveStatus({
        dayOfWeek: day,
        applyOverrides: raw !== 'true',
        liveStatus: liveStatus || false,
      });
      
      console.log(`[CHANNELS-SCHEDULES-${requestId}] Cache combination query completed (${Date.now() - queryStart}ms) - ${allSchedules.length} schedules`);
    } catch (error) {
      console.error(`[CHANNELS-SCHEDULES-${requestId}] Error in cache combination approach:`, error.message);
      
      // EMERGENCY FALLBACK: Use basic schedules without live status
      console.log(`[CHANNELS-SCHEDULES-${requestId}] Using emergency fallback...`);
      try {
        allSchedules = await this.schedulesService.findAll({
          dayOfWeek: day,
          applyOverrides: raw !== 'true',
          liveStatus: false, // Skip live status in emergency
        });
        
        console.log(`[CHANNELS-SCHEDULES-${requestId}] Emergency fallback completed - ${allSchedules.length} schedules`);
      } catch (fallbackError) {
        console.error(`[CHANNELS-SCHEDULES-${requestId}] Emergency fallback also failed:`, fallbackError.message);
        allSchedules = [];
      }
    }

    // Group schedules by channel
    const groupStart = Date.now();
    const schedulesGroupedByChannelId = allSchedules.reduce((acc, schedule) => {
      const channelId = schedule.program?.channel?.id;
      if (!channelId) return acc;
      if (!acc[channelId]) acc[channelId] = [];
      acc[channelId].push(schedule);
      return acc;
    }, {} as Record<number, any[]>);

    // Get all channels for the result structure (with caching)
    const channelsQueryStart = Date.now();
    const channelsCacheKey = 'channels:visible_with_categories';
    
    let channels = await this.redisService.get<any[]>(channelsCacheKey);
    if (!channels) {
      channels = await this.channelsRepository.find({
        where: { is_visible: true },
        order: { order: 'ASC' },
        relations: ['categories'],
      });
      
      // Cache for 30 minutes (matches schedules cache TTL)
      await this.redisService.set(channelsCacheKey, channels, 1800);
      console.log(`[CHANNELS-SCHEDULES] Channels query completed from DB (${Date.now() - channelsQueryStart}ms) - ${channels.length} channels`);
    } else {
      console.log(`[CHANNELS-SCHEDULES] Channels from cache (${Date.now() - channelsQueryStart}ms) - ${channels.length} channels`);
    }

    // Build final result
    const resultStart = Date.now();
    const result: ChannelWithSchedules[] = channels.map(channel => {
      return {
        channel: {
          id: channel.id,
          name: channel.name,
          logo_url: channel.logo_url,
          background_color: channel.background_color,
          show_only_when_scheduled: channel.show_only_when_scheduled,
          categories: channel.categories,
        },
      schedules: (schedulesGroupedByChannelId[channel.id] || []).map((schedule) => ({
        id: schedule.id,
        day_of_week: schedule.day_of_week,
        start_time: schedule.start_time,
        end_time: schedule.end_time,
        subscribed: subscribedProgramIds.has(schedule.program.id),
        isWeeklyOverride: schedule.isWeeklyOverride,
        overrideType: schedule.overrideType,
        program: {
          id: schedule.program.id,
          name: schedule.program.name,
          logo_url: schedule.program.logo_url,
          description: schedule.program.description,
          stream_url: schedule.program.stream_url,
          is_live: schedule.program.is_live,
          live_streams: schedule.program.live_streams,
          stream_count: schedule.program.stream_count,
          channel_stream_count: schedule.program.channel_stream_count,
          panelists: schedule.program.panelists?.map((p) => ({
            id: p.id.toString(),
            name: p.name,
          })) || [],
          style_override: schedule.program.style_override,
        },
      })),
      };
    });
    console.log(`[CHANNELS-SCHEDULES] Built result (${Date.now() - resultStart}ms) - ${result.length} channels`);
    console.log(`[CHANNELS-SCHEDULES] TOTAL time: ${Date.now() - overallStart}ms`);
    return result;
  }

  /**
   * Get today's schedules only - optimized for initial page load
   */
  async getTodaySchedules(deviceId?: string, liveStatus?: boolean, raw?: string): Promise<ChannelWithSchedules[]> {
    const today = TimezoneUtil.currentDayOfWeek();
    
    return this.getChannelsWithSchedules(today, deviceId, liveStatus, raw);
  }

  /**
   * Get full week schedules - optimized for background loading
   */
  async getWeekSchedules(deviceId?: string, liveStatus?: boolean, raw?: string): Promise<ChannelWithSchedules[]> {
    
    return this.getChannelsWithSchedules(undefined, deviceId, liveStatus, raw);
  }

  private convertTimeToNumber(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 100 + m;
  }

  /**
   * Invalidate live status caches for a specific handle
   * Used when channel handle changes
   */
  private async invalidateLiveStatusCaches(handle?: string): Promise<void> {
    if (!handle) {
      return; // Can't invalidate without handle
    }
    
    try {
      // Invalidate unified live status cache - new format (handle based)
      await this.redisService.del(`liveStatusByHandle:${handle}`);
      console.log(`🗑️ Invalidated live status cache for handle: ${handle}`);
    } catch (error) {
      console.error(`❌ Error invalidating live status cache for ${handle}:`, error.message);
    }
  }

}
