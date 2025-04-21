import { Controller, Post, Get, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Channel } from './channels/channels.entity';
import { Program } from './programs/programs.entity';
import { Schedule } from './schedules/schedules.entity';
import { Panelist } from './panelists/panelists.entity';
import { YoutubeDiscoveryService } from './youtube/youtube-discovery.service';
import { YoutubeLiveService } from './youtube/youtube-live.service';
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
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    private readonly dataSource: DataSource,
    private readonly youtubeDiscoveryService: YoutubeDiscoveryService,
    private readonly youtubeLiveService: YoutubeLiveService,
  ) {}

  @Post('seed')
  async seed() {
    const existingChannels = await this.channelsRepository.find({
      where: [
        { name: 'Bondi Live' },
        { name: 'La Casa Streaming' },
      ],
    });

    const hasBondi = existingChannels.find(c => c.name === 'Bondi Live');
    const hasCasa = existingChannels.find(c => c.name === 'La Casa Streaming');

    if (!hasBondi) {
      const bondi = await this.channelsRepository.save({
        name: 'Bondi Live',
        description: '',
        logo_url: null,
      });

      const bondiPrograms = await Promise.all([
        {
          name: 'Tremenda Mañana',
          panelists: ['Esteban Trebucq', 'Carlos Strione', 'Sol Simunivic'],
          start: '09:00',
          end: '10:30',
        },
        {
          name: 'El Ejército de la Mañana',
          panelists: ['Pepe Ochoa', 'Fede Bongiorno'],
          start: '10:30',
          end: '12:00',
        },
        {
          name: 'Ángel Responde',
          panelists: ['Ángel De Brito', 'Carla Conte', 'Dalma Maradona', 'Juli Argenta'],
          start: '12:00',
          end: '14:00',
        },
      ].map(async ({ name, panelists, start, end }) => {
        const savedPanelists = await this.panelistsRepository.save(
          panelists.map(name => ({ name }))
        );
        return this.programsRepository.save({
          name,
          description: '',
          start_time: start,
          end_time: end,
          channel: bondi,
          panelists: savedPanelists,
        });
      }));

      const findBondi = (name: string) => bondiPrograms.find(p => p.name === name)!;

      await this.schedulesRepository.save(
        ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].flatMap(day => [
          {
            day_of_week: day,
            start_time: '09:00',
            end_time: '10:30',
            program: findBondi('Tremenda Mañana'),
          },
          {
            day_of_week: day,
            start_time: '10:30',
            end_time: '12:00',
            program: findBondi('El Ejército de la Mañana'),
          },
          {
            day_of_week: day,
            start_time: '12:00',
            end_time: '14:00',
            program: findBondi('Ángel Responde'),
          },
        ])
      );
    }

    if (!hasCasa) {
      const casa = await this.channelsRepository.save({
        name: 'La Casa Streaming',
        description: '',
        logo_url: null,
      });

      const casaPrograms = await Promise.all([
        { name: 'Tengo Capturas', panelists: [], start: '10:30', end: '12:00', days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] },
        { name: 'Rumis', panelists: [], start: '12:00', end: '14:00', days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] },
        { name: 'Circuito Cerrado', panelists: [], start: '14:00', end: '16:00', days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] },
        { name: 'Corte y Queda', panelists: [], start: '16:00', end: '18:00', days: ['monday', 'wednesday', 'friday'] },
        { name: 'Falta de Límites', panelists: [], start: '16:00', end: '18:00', days: ['tuesday', 'thursday'] },
        { name: 'Al Horno con maru', panelists: [], start: '18:00', end: '18:30', days: ['monday'] },
      ].map(async ({ name, panelists, start, end, days }) => {
        const saved = await this.programsRepository.save({
          name,
          description: '',
          start_time: start,
          end_time: end,
          channel: casa,
          panelists: [],
        });
        return { program: saved, days };
      }));

      await this.schedulesRepository.save(
        casaPrograms.flatMap(({ program, days }) =>
          days.map(day => ({
            program,
            day_of_week: day,
          }))
        )
      );
    }

    return { message: 'Seed completed for Bondi Live and La Casa Streaming (only if not already present).' };
  }

  @Get('youtube/resolve-handles')
  async getChannelsFromHandles() {
    const urls = [
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
    ];

    return this.youtubeDiscoveryService.getChannelIdsFromLiveUrls(urls);
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

    console.log(`📝 [cache-test] Setting key ${key} with value`, value);
    await this.cacheManager.set(key, value, ttl);
    console.log(`✅ [cache-test] Key ${key} set successfully.`);

    return { message: 'Cache set!', key, value, ttl };
  }

  @Get('cache-test')
  async cacheTestGet() {
    const key = 'test:mykey';
    
    console.log(`🔎 [cache-test] Getting key ${key} from cache...`);
    const cachedValue = await this.cacheManager.get(key);
    console.log(`📦 [cache-test] Retrieved value for key ${key}:`, cachedValue);

    return { key, cachedValue };
  }
}