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
  ) {
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

    const channelsStart = Date.now();
    const channels = await this.channelsRepository.find({
      where: {
        is_visible: true,
      },
      order: {
        order: 'ASC',
      },
    });
    console.log('[getChannelsWithSchedules] Channels fetched in', Date.now() - channelsStart, 'ms');

    const schedulesStart = Date.now();
    const schedules = await this.schedulesService.findAll({
      dayOfWeek: day ? day.toLowerCase() : undefined,
      skipCache: liveStatus === true,
      applyOverrides: raw !== 'true',
    });
    console.log('[getChannelsWithSchedules] Schedules fetched in', Date.now() - schedulesStart, 'ms');

    // Get user subscriptions based on deviceId
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

    const groupStart = Date.now();
    const schedulesGroupedByChannelId = schedules.reduce((acc, schedule) => {
      const channelId = schedule.program?.channel?.id;
      if (!channelId) return acc;
      if (!acc[channelId]) acc[channelId] = [];
      acc[channelId].push(schedule);
      return acc;
    }, {} as Record<number, any[]>);
    console.log('[getChannelsWithSchedules] Grouped schedules in', Date.now() - groupStart, 'ms');

    const resultStart = Date.now();
    const result: ChannelWithSchedules[] = channels.map((channel) => ({
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
}
