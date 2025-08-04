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
import { getCurrentBlockTTL } from '@/utils/getBlockTTL.util';
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
    private readonly dataSource: DataSource,
    private readonly schedulesService: SchedulesService,
    private readonly redisService: RedisService,
    private readonly youtubeDiscovery: YoutubeDiscoveryService,
    private readonly configService: ConfigService,
    private readonly weeklyOverridesService: WeeklyOverridesService,
    private readonly youtubeLiveService: YoutubeLiveService,
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
      order: {
        order: 'ASC',
      },
    });
  }

  async findOne(id: number): Promise<Channel> {
    const channel = await this.channelsRepository.findOne({ where: { id } });
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
  
    const channel = this.channelsRepository.create({
      ...createChannelDto,
      order: newOrder,
    });
  
    await this.redisService.delByPattern('schedules:all:*');
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
    
    Object.keys(updateChannelDto).forEach((key) => {
      if (updateChannelDto[key] !== undefined) {
        channel[key] = updateChannelDto[key];
      }
    });

    await this.redisService.delByPattern('schedules:all:*');
    const updated = await this.channelsRepository.save(channel);

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
    await this.redisService.delByPattern('schedules:all:*');

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
    await this.redisService.delByPattern('schedules:all:*');

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
    console.log('[getChannelsWithSchedules] START');

    // Pre-fetch user subscriptions if deviceId is provided
    let subscribedProgramIds: Set<number> = new Set();
    if (deviceId) {
      const device = await this.deviceRepo.findOne({
        where: { deviceId },
        relations: ['user'],
      });
      if (device?.user) {
        const subscriptions = await this.userSubscriptionRepo.find({
          where: { user: { id: device.user.id }, isActive: true },
          relations: ['program'],
        });
        subscribedProgramIds = new Set(subscriptions.map(sub => sub.program.id));
      }
    }

    // Use optimized single query with all necessary joins
    const queryStart = Date.now();
    const queryBuilder = this.channelsRepository
      .createQueryBuilder('channel')
      .leftJoinAndSelect('channel.programs', 'program')
      .leftJoinAndSelect('program.schedules', 'schedule')
      .leftJoinAndSelect('program.panelists', 'panelists')
      .where('channel.is_visible = :isVisible', { isVisible: true })
      .orderBy('channel.order', 'ASC')
      .addOrderBy('schedule.start_time', 'ASC')
      .addOrderBy('panelists.id', 'ASC');

    if (day) {
      queryBuilder.andWhere('schedule.day_of_week = :dayOfWeek', { dayOfWeek: day.toLowerCase() });
    }

    const channelsWithPrograms = await queryBuilder.getMany();
    console.log('[getChannelsWithSchedules] Optimized query completed in', Date.now() - queryStart, 'ms');

    // Extract and flatten all schedules for processing
    const allSchedules: any[] = [];
    channelsWithPrograms.forEach(channel => {
      channel.programs?.forEach(program => {
        program.schedules?.forEach(schedule => {
          allSchedules.push({
            ...schedule,
            program: {
              ...program,
              channel: { id: channel.id, name: channel.name, logo_url: channel.logo_url }
            }
          });
        });
      });
    });

    console.log('[getChannelsWithSchedules] Extracted', allSchedules.length, 'schedules');

    // Apply weekly overrides if needed
    let processedSchedules = allSchedules;
    if (raw !== 'true') {
      const currentWeekStart = this.weeklyOverridesService.getWeekStartDate('current');
      const overridesStart = Date.now();
      console.log('[getChannelsWithSchedules] Applying weekly overrides...');
      processedSchedules = await this.weeklyOverridesService.applyWeeklyOverrides(allSchedules, currentWeekStart);
      console.log('[getChannelsWithSchedules] Weekly overrides applied in', Date.now() - overridesStart, 'ms');
    }

    // Enrich schedules with live status (batch process)
    const enrichStart = Date.now();
    console.log('[getChannelsWithSchedules] Enriching schedules...');
    const enrichedSchedules = await this.enrichSchedulesBatch(processedSchedules);
    console.log('[getChannelsWithSchedules] Enriched schedules in', Date.now() - enrichStart, 'ms');

    // Group schedules by channel
    const groupStart = Date.now();
    const schedulesGroupedByChannelId = enrichedSchedules.reduce((acc, schedule) => {
      const channelId = schedule.program?.channel?.id;
      if (!channelId) return acc;
      if (!acc[channelId]) acc[channelId] = [];
      acc[channelId].push(schedule);
      return acc;
    }, {} as Record<number, any[]>);
    console.log('[getChannelsWithSchedules] Grouped schedules in', Date.now() - groupStart, 'ms');

    // Build final result
    const resultStart = Date.now();
    const result: ChannelWithSchedules[] = channelsWithPrograms.map(channel => ({
      channel: {
        id: channel.id,
        name: channel.name,
        logo_url: channel.logo_url,
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
          panelists: schedule.program.panelists?.map((p) => ({
            id: p.id.toString(),
            name: p.name,
          })) || [],
          style_override: schedule.program.style_override,
        },
      })),
    }));
    console.log('[getChannelsWithSchedules] Built result in', Date.now() - resultStart, 'ms');
    console.log('[getChannelsWithSchedules] TOTAL time:', Date.now() - overallStart, 'ms');
    return result;
  }

  // New optimized batch enrichment method
  private async enrichSchedulesBatch(schedules: any[]): Promise<any[]> {
    console.log('[enrichSchedulesBatch] Starting batch enrichment of', schedules.length, 'schedules');
    const now = this.dayjs().tz('America/Argentina/Buenos_Aires');
    const currentNum = now.hour() * 100 + now.minute();
    const currentDay = now.format('dddd').toLowerCase();

    // Collect all unique channel IDs and handles for batch processing
    const channelInfoMap = new Map<string, { channelId: string; handle: string; canFetch: boolean }>();
    const schedulesToEnrich: any[] = [];

    for (const schedule of schedules) {
      const { program } = schedule;
      const channel = program.channel;
      const channelId = channel?.youtube_channel_id;
      const handle = channel?.handle;

      const startNum = this.convertTimeToNumber(schedule.start_time);
      const endNum = this.convertTimeToNumber(schedule.end_time);

      // Check if this schedule should be enriched (is currently live)
      const isCurrentlyLive = schedule.day_of_week === currentDay &&
        currentNum >= startNum &&
        currentNum < endNum &&
        handle &&
        channelId;

      if (isCurrentlyLive) {
        if (!channelInfoMap.has(channelId)) {
          const canFetch = await this.configService.canFetchLive(handle);
          channelInfoMap.set(channelId, { channelId, handle, canFetch });
        }
        
        if (channelInfoMap.get(channelId)?.canFetch) {
          schedulesToEnrich.push(schedule);
        }
      }
    }

          // Batch fetch live video IDs for all channels that need enrichment
      const liveVideoIds = new Map<string, string>();
      if (schedulesToEnrich.length > 0) {
        const uniqueChannelIds = Array.from(channelInfoMap.keys());
        console.log('[enrichSchedulesBatch] Batch fetching live video IDs for', uniqueChannelIds.length, 'channels');
        
        // Batch Redis lookups
        const redisKeys = uniqueChannelIds.map(id => `liveVideoIdByChannel:${id}`);
        const cachedIds = await Promise.all(
          redisKeys.map(key => this.redisService.get<string>(key))
        );
        
        // Process cached results
        uniqueChannelIds.forEach((channelId, index) => {
          const cachedId = cachedIds[index];
          if (cachedId) {
            liveVideoIds.set(channelId, cachedId);
          }
        });

        // Fetch missing video IDs in parallel
        const missingChannels = uniqueChannelIds.filter(id => !liveVideoIds.has(id));
        if (missingChannels.length > 0) {
          console.log('[enrichSchedulesBatch] Fetching', missingChannels.length, 'missing video IDs');
          const fetchPromises = missingChannels.map(async (channelId) => {
            const channelInfo = channelInfoMap.get(channelId);
            if (!channelInfo) return;

            const ttl = await getCurrentBlockTTL(channelId, schedules);
            const vid = await this.youtubeLiveService.getLiveVideoId(
              channelId,
              channelInfo.handle,
              ttl,
              'onDemand'
            );
            if (vid && vid !== '__SKIPPED__') {
              liveVideoIds.set(channelId, vid);
            }
          });

          await Promise.all(fetchPromises);
        }
      }

    // Apply enrichment to all schedules
    const enriched: any[] = [];
    for (const schedule of schedules) {
      const { program } = schedule;
      const channel = program.channel;
      const channelId = channel?.youtube_channel_id;
      const handle = channel?.handle;

      const startNum = this.convertTimeToNumber(schedule.start_time);
      const endNum = this.convertTimeToNumber(schedule.end_time);

      let isLive = false;
      let streamUrl = program.youtube_url;

      // Check if currently live and should be enriched
      if (schedule.day_of_week === currentDay &&
          currentNum >= startNum &&
          currentNum < endNum &&
          handle &&
          channelId) {
        
        // Set isLive to true if schedule is currently running
        isLive = true;
        
        const channelInfo = channelInfoMap.get(channelId);
        if (channelInfo?.canFetch) {
          const liveVideoId = liveVideoIds.get(channelId);
          if (liveVideoId) {
            streamUrl = `https://www.youtube.com/embed/${liveVideoId}?autoplay=1`;
          }
          // If no liveVideoId, keep the original streamUrl
        }
      }

      enriched.push({
        ...schedule,
        program: {
          ...program,
          is_live: isLive,
          stream_url: streamUrl,
        },
      });
    }

    console.log('[enrichSchedulesBatch] Enriched', enriched.length, 'schedules');
    return enriched;
  }

  private convertTimeToNumber(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 100 + m;
  }
}
