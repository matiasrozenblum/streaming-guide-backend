import { Controller, Post, Get, Inject, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Channel } from './channels/channels.entity';
import { Program } from './programs/programs.entity';
import { Schedule } from './schedules/schedules.entity';
import { Panelist } from './panelists/panelists.entity';
import { YoutubeDiscoveryService } from './youtube/youtube-discovery.service';
import { YoutubeLiveService } from './youtube/youtube-live.service';
import { RedisService } from './redis/redis.service'; // 🔥
import { AuthGuard } from '@nestjs/passport';
import * as DateHolidays from 'date-holidays';
import { Roles } from './auth/roles.decorator';

const HolidaysClass = (DateHolidays as any).default ?? DateHolidays;

@Controller()
export class AppController {
  private hd = new HolidaysClass('AR');
  constructor(
    @InjectRepository(Channel)
    private readonly channelsRepository: Repository<Channel>,
    @InjectRepository(Program)
    private readonly programsRepository: Repository<Program>,
    @InjectRepository(Schedule)
    private readonly schedulesRepository: Repository<Schedule>,
    @InjectRepository(Panelist)
    private readonly panelistsRepository: Repository<Panelist>,
    private readonly dataSource: DataSource,
    private readonly youtubeDiscoveryService: YoutubeDiscoveryService,
    private readonly youtubeLiveService: YoutubeLiveService,
    private readonly redisService: RedisService, // 🔥
  ) {
    console.log('🚀 AppController initialized');
  }

  @Get('youtube/resolve-handles')
  async getChannelsFromHandles() {
    // Get all channels from the database
    const channels = await this.channelsRepository.find({
      select: ['handle']
    });

    // Filter out channels without handles and build YouTube URLs
    const youtubeUrls = channels
      .filter(channel => channel.handle && channel.handle.trim() !== '')
      .map(channel => {
        // Ensure handle starts with @ if it doesn't already
        const handle = channel.handle.startsWith('@') ? channel.handle : `@${channel.handle}`;
        return `https://www.youtube.com/${handle}/live`;
      });

    if (youtubeUrls.length === 0) {
      return { message: 'No channels with valid handles found in the database' };
    }

    return this.youtubeDiscoveryService.getChannelIdsFromLiveUrls(youtubeUrls);
  }

  @UseGuards(AuthGuard('jwt'))
  @Roles('admin')
  @Post('youtube/fetch-live-ids')
  async fetchYoutubeLiveIds() {
    await this.youtubeLiveService.fetchLiveVideoIds();
    return { 
      success: true, 
      message: 'YouTube live video IDs fetched successfully.' 
    };
  }

  @Post('cache-test')
  async cacheTestSet() {
    const key = 'test:mykey';
    const value = { hello: 'world', timestamp: Date.now() };
    const ttl = 300; // 5 minutos

    console.log(`📝 Setting key ${key} with value`, value);
    await this.redisService.set(key, value, ttl);
    console.log(`✅ Key ${key} set successfully.`);

    return { message: 'Cache set!', key, value, ttl };
  }

  @Get('cache-test')
  async cacheTestGet() {
    const key = 'test:mykey';

    console.log(`🔎 Getting key ${key} from Redis...`);
    const cachedValue = await this.redisService.get(key);
    console.log(`📦 Retrieved value for key ${key}:`, cachedValue);

    return { key, cachedValue };
  }

  @Get('cache-test-del')
  async cacheTestDel() {
    const patterns = [
      'cron:count:*',
      'onDemand:count:*',
      'cron:*:count:*',
      'onDemand:*:count:*',
    ];

    for (const pattern of patterns) {
      await this.redisService.delByPattern(pattern);
    }

    return { message: 'All counter entries deleted.' };
  }

  @UseGuards(AuthGuard('jwt'))
  @Roles('admin')
  @Post('cache/clear-schedules')
  async clearScheduleCache() {
    await this.redisService.delByPattern('schedules:all:*');
    return { 
      success: true, 
      message: 'Schedule cache cleared successfully' 
    };
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('stats')
  async getStats(): Promise<{
    channels: number;
    programs: number;
    panelists: number;
    schedules: number;
  }> {
    const [
      channelsCount,
      programsCount,
      panelistsCount,
      schedulesCount,
    ] = await Promise.all([
      this.channelsRepository.count(),
      this.programsRepository.count(),
      this.panelistsRepository.count(),
      this.schedulesRepository.count(),
    ]);

    return {
      channels: channelsCount,
      programs: programsCount,
      panelists: panelistsCount,
      schedules: schedulesCount,
    };
  }
  
  @Get('holiday')
  isHoliday() {
    const today = new Date();
    return { holiday: !!this.hd.isHoliday(today) };
  }
}
