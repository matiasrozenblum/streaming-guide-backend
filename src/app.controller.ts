import { Controller, Post, Get, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Channel } from './channels/channels.entity';
import { Program } from './programs/programs.entity';
import { Schedule } from './schedules/schedules.entity';
import { Panelist } from './panelists/panelists.entity';
import { YoutubeDiscoveryService } from './youtube/youtube-discovery.service';
import { YoutubeLiveService } from './youtube/youtube-live.service';
import { RedisService } from './redis/redis.service'; // 🔥

@Controller()
export class AppController {
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
    return this.youtubeDiscoveryService.getChannelIdsFromLiveUrls([
      'https://www.youtube.com/@luzutv/live',
      'https://www.youtube.com/@VorterixOficial/live',
      'https://www.youtube.com/@UrbanaPlayFM/live',
      'https://www.youtube.com/@estoesblender/live',
      'https://www.youtube.com/@somoslacasa/live',
      'https://www.youtube.com/@Bondi_liveok/live',
      'https://www.youtube.com/@olgaenvivo_/live',
      'https://www.youtube.com/@SomosGelatina/live',
      'https://www.youtube.com/@Updr/live',
      'https://www.youtube.com/@CarajoStream/live',
      'https://www.youtube.com/@republicaz/live',
      'https://www.youtube.com/@futurock/live'
    ]);
  }

  @Post('youtube/fetch-live-ids')
  async fetchYoutubeLiveIds() {
    await this.youtubeLiveService.fetchLiveVideoIds();
    return { message: 'YouTube live video IDs fetched successfully.' };
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
}
