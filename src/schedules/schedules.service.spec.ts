import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SchedulesService } from './schedules.service';
import { Schedule } from './schedules.entity';
import { Program } from '../programs/programs.entity';
import { RedisService } from '../redis/redis.service';
import { YoutubeLiveService } from '../youtube/youtube-live.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WeeklyOverridesService } from './weekly-overrides.service';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';
import { ConfigService } from '../config/config.service';
import { NotifyAndRevalidateUtil } from '../utils/notify-and-revalidate.util';
import { SentryService } from '../sentry/sentry.service';

dayjs.extend(utc);
dayjs.extend(timezone);

let currentTime = '15:00';
let currentDay = 'monday';

jest.mock('dayjs', () => {
  const actualDayjs = jest.requireActual('dayjs');

  const mockDayjs = (date?: string | number | Date) => {
    const instance = actualDayjs(date);
    return {
      ...instance,
      format: (formatString: string) => {
        if (formatString === 'dddd') return currentDay;
        if (formatString === 'HH:mm') return currentTime;
        return instance.format(formatString);
      },
      hour: (hour?: number) => {
        if (typeof hour === 'number') {
          const [_, m] = (currentTime ?? '00:00').split(':');
          currentTime = `${hour.toString().padStart(2, '0')}:${m}`;
          return mockDayjs();
        }
        const [h] = (currentTime ?? '00:00').split(':');
        return parseInt(h);
      },
      minute: (minute?: number) => {
        if (typeof minute === 'number') {
          const [h] = (currentTime ?? '00:00').split(':');
          currentTime = `${h}:${minute.toString().padStart(2, '0')}`;
          return mockDayjs();
        }
        const [, m] = (currentTime ?? '00:00').split(':');
        return parseInt(m);
      },
      tz: () => mockDayjs(),
      startOf: (unit: string) => {
        // Return a mock object with the add method
        return {
          add: (amount: number, unit: string) => {
            // Return a mock object with the diff method
            return {
              diff: (date: any, unit: string) => {
                // Return a reasonable TTL value for testing
                return 3600; // 1 hour in seconds
              }
            };
          }
        };
      },
      add: (amount: number, unit: string) => {
        return {
          diff: (date: any, unit: string) => {
            // Return a reasonable TTL value for testing
            return 3600; // 1 hour in seconds
          }
        };
      },
      diff: (date: any, unit: string) => {
        // Return a reasonable TTL value for testing
        return 3600; // 1 hour in seconds
      },
      endOf: (unit: string) => {
        return {
          diff: (date: any, unit: string) => {
            // Return a reasonable TTL value for testing
            return 3600; // 1 hour in seconds
          }
        };
      }
    };
  };

  mockDayjs.extend = actualDayjs.extend;
  return mockDayjs;
});

describe('SchedulesService', () => {
  let service: SchedulesService;
  let schedulesRepo: Repository<Schedule>;
  let programsRepo: Repository<Program>;
  let redisService: RedisService;
  let youtubeLiveService: YoutubeLiveService;
  let configService: ConfigService;
  let notifyUtil: NotifyAndRevalidateUtil;

  const mockChannel = {
    id: 1,
    name: 'Test Channel',
    description: 'Test Description',
    logo_url: 'test-logo.png',
    handle: 'test',
    youtube_channel_id: 'test-channel-id',
    programs: [],
    is_visible: true,
  };

  const mockProgram = {
    id: 1,
    name: 'Test Program',
    description: 'Test Description',
    logo_url: 'test-logo.png',
    youtube_url: 'https://youtube.com/test',
    is_live: false,
    stream_url: '',
    channel: mockChannel,
    panelists: [],
    schedules: [],
  };

  const mockSchedule = {
    id: 1,
    day_of_week: 'monday',
    start_time: '08:00',
    end_time: '10:00',
    program: mockProgram,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const mockQueryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([mockSchedule]),
      getOne: jest.fn().mockResolvedValue(mockSchedule),
      getSql: jest.fn().mockReturnValue('SELECT * FROM schedule'),
      getParameters: jest.fn().mockReturnValue({}),
      getRawMany: jest.fn().mockResolvedValue([]),
      getRawOne: jest.fn().mockResolvedValue(null),
    };

    // Debug: Log the mock query builder
    console.log('Mock query builder created:', Object.keys(mockQueryBuilder));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulesService,
        {
          provide: getRepositoryToken(Schedule),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn(),
            delete: jest.fn(),
            create: jest.fn(),
            createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
          },
        },
        {
          provide: getRepositoryToken(Program),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
            delByPattern: jest.fn(),
          },
        },
        {
          provide: YoutubeLiveService,
          useValue: {
            getLiveVideoId: jest.fn(),
            getLiveStreams: jest.fn(),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            list: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: WeeklyOverridesService,
          useValue: {
            getWeekStartDate: jest.fn().mockReturnValue('2024-01-01'),
            applyWeeklyOverrides: jest.fn().mockImplementation((schedules) => Promise.resolve(schedules)),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            canFetchLive: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: SentryService,
          useValue: {
            captureMessage: jest.fn(),
            captureException: jest.fn(),
            setTag: jest.fn(),
            addBreadcrumb: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SchedulesService>(SchedulesService);
    schedulesRepo = module.get<Repository<Schedule>>(getRepositoryToken(Schedule));
    programsRepo = module.get<Repository<Program>>(getRepositoryToken(Program));
    redisService = module.get<RedisService>(RedisService);
    youtubeLiveService = module.get<YoutubeLiveService>(YoutubeLiveService);
    configService = module.get<ConfigService>(ConfigService);
    notifyUtil = new NotifyAndRevalidateUtil(
      redisService as any,
      'https://frontend.test',
      'testsecret'
    );
    service['notifyUtil'] = notifyUtil;
  });

  describe('findByDay', () => {
    it('should return schedules for a specific day with live status', async () => {
      const testSchedule = {
        id: 1,
        day_of_week: 'monday',
        start_time: '10:00',
        end_time: '12:00',
        program: {
          id: 1,
          name: 'Live Stream',
          description: 'Test Description',
          logo_url: 'test-logo.png',
          youtube_url: 'https://youtube.com/test',
          is_live: false,
          stream_url: '',
          channel: {
            id: 1,
            name: 'Test Channel',
            description: 'Test Description',
            logo_url: 'test-logo.png',
            handle: 'test',
            youtube_channel_id: 'test-channel-id',
            programs: [],
          },
          panelists: [],
          schedules: [],
        },
      } as unknown as Schedule;

      // Mock the query builder to return our test schedule
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([testSchedule]),
        getOne: jest.fn().mockResolvedValue(testSchedule),
      };
      
      jest.spyOn(schedulesRepo, 'createQueryBuilder').mockReturnValue(mockQueryBuilder as any);
      // Mock Redis: first call for schedules cache (miss), then calls for streams cache (miss), then single video ID cache (hit)
      jest.spyOn(redisService, 'get')
        .mockResolvedValueOnce(null); // schedules cache miss
      
      // Mock getLiveStreams to return actual stream data
      jest.spyOn(youtubeLiveService, 'getLiveStreams').mockResolvedValue({
        streams: [{
          videoId: 'live-video-id',
          title: 'Live Stream',
          publishedAt: new Date().toISOString(),
          description: '',
          channelTitle: 'Test Channel'
        }],
        primaryVideoId: 'live-video-id',
        streamCount: 1
      });

      currentTime = '11:00';
      currentDay = 'monday';

      const result = await service.findAll({ dayOfWeek: 'monday', liveStatus: true });

      expect(result).toHaveLength(1);
      expect(result[0].program.is_live).toBe(true);
      expect(result[0].program.stream_url).toBe('https://www.youtube.com/embed/live-video-id?autoplay=1');
    });

    it('should not mark program as live if outside time', async () => {
      const testSchedule = {
        id: 1,
        day_of_week: 'monday',
        start_time: '08:00',
        end_time: '10:00',
        program: {
          id: 1,
          name: 'Test Program',
          description: 'Test Description',
          logo_url: 'test-logo.png',
          youtube_url: 'https://youtube.com/test',
          is_live: false,
          stream_url: '',
          channel: {
            id: 1,
            name: 'Test Channel',
            description: 'Test Description',
            logo_url: 'test-logo.png',
            handle: 'test',
            youtube_channel_id: 'test-channel-id',
            programs: [],
          },
          panelists: [],
          schedules: [],
        },
      } as unknown as Schedule;

      // Mock the query builder to return our test schedule
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([testSchedule]),
        getOne: jest.fn().mockResolvedValue(testSchedule),
      };
      
      jest.spyOn(schedulesRepo, 'createQueryBuilder').mockReturnValue(mockQueryBuilder as any);
      jest.spyOn(redisService, 'get').mockResolvedValueOnce(null);

      currentTime = '15:00'; // fuera de rango
      currentDay = 'monday';

      const result = await service.findByDay('monday');

      expect(result[0].program.is_live).toBe(false);
      expect(result[0].program.stream_url).toBe('https://youtube.com/test');
    });
  });

  describe('notifyAndRevalidate integration', () => {
    it('calls notifyAndRevalidate on create', async () => {
      const spy = jest.spyOn(notifyUtil, 'notifyAndRevalidate').mockResolvedValue(undefined as any);
      jest.spyOn(programsRepo, 'findOne').mockResolvedValue({ id: 1 } as any);
      jest.spyOn(schedulesRepo, 'create').mockReturnValue({ id: 1 } as any);
      jest.spyOn(schedulesRepo, 'save').mockResolvedValue({ id: 1 } as any);
      await service.create({ programId: '1', channelId: '1', dayOfWeek: 'monday', startTime: '10:00', endTime: '12:00' });
      expect(spy).toHaveBeenCalled();
    });
    it('calls notifyAndRevalidate on update', async () => {
      const spy = jest.spyOn(notifyUtil, 'notifyAndRevalidate').mockResolvedValue(undefined as any);
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 1 } as any);
      jest.spyOn(schedulesRepo, 'save').mockResolvedValue({ id: 1 } as any);
      await service.update('1', { dayOfWeek: 'tuesday' });
      expect(spy).toHaveBeenCalled();
    });
    it('calls notifyAndRevalidate on remove', async () => {
      const spy = jest.spyOn(notifyUtil, 'notifyAndRevalidate').mockResolvedValue(undefined as any);
      jest.spyOn(schedulesRepo, 'delete').mockResolvedValue({ affected: 1 } as any);
      await service.remove('1');
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('Multiple Streams Feature', () => {
    beforeEach(() => {
      // Reset mocks
      jest.clearAllMocks();
      
      // Mock dayjs to return consistent time
      jest.spyOn(service as any, 'dayjs').mockReturnValue({
        tz: jest.fn().mockReturnThis(),
        hour: jest.fn().mockReturnValue(11),
        minute: jest.fn().mockReturnValue(0),
        format: jest.fn().mockReturnValue('monday')
      });
    });

    it('should distribute multiple streams to overlapping programs', async () => {
      const testSchedules = [
        {
          id: 1,
          day_of_week: 'monday',
          start_time: '10:00',
          end_time: '12:00',
          program: {
            id: 1,
            name: 'Live Stream 1',
            description: 'Description A',
            logo_url: 'logo-a.png',
            youtube_url: 'https://youtube.com/program-a',
            is_live: false,
            stream_url: '',
            channel: {
              id: 1,
              name: 'Test Channel',
              description: 'Test Description',
              logo_url: 'test-logo.png',
              handle: 'testchannel',
              youtube_channel_id: 'test-channel-id',
              programs: [],
            },
            panelists: [],
            schedules: [],
          },
        },
        {
          id: 2,
          day_of_week: 'monday',
          start_time: '11:00',
          end_time: '13:00',
          program: {
            id: 2,
            name: 'Live Stream 2',
            description: 'Description B',
            logo_url: 'logo-b.png',
            youtube_url: 'https://youtube.com/program-b',
            is_live: false,
            stream_url: '',
            channel: {
              id: 1,
              name: 'Test Channel',
              description: 'Test Description',
              logo_url: 'test-logo.png',
              handle: 'testchannel',
              youtube_channel_id: 'test-channel-id',
              programs: [],
            },
            panelists: [],
            schedules: [],
          },
        }
      ] as unknown as Schedule[];

      const mockStreams = {
        streams: [
          {
            videoId: 'stream1',
            title: 'Live Stream 1',
            publishedAt: '2023-01-01T00:00:00Z',
            description: 'Stream 1 Description',
            thumbnailUrl: 'thumb1.jpg',
            channelTitle: 'Test Channel'
          },
          {
            videoId: 'stream2',
            title: 'Live Stream 2',
            publishedAt: '2023-01-01T01:00:00Z',
            description: 'Stream 2 Description',
            thumbnailUrl: 'thumb2.jpg',
            channelTitle: 'Test Channel'
          }
        ],
        primaryVideoId: 'stream1',
        streamCount: 2
      };

      // Mock config service
      jest.spyOn(configService, 'canFetchLive').mockResolvedValue(true);
      
      // Mock YouTube service
      jest.spyOn(youtubeLiveService, 'getLiveStreams').mockResolvedValue(mockStreams);
      jest.spyOn(youtubeLiveService, 'getLiveVideoId').mockResolvedValue('fallback-video-id');

      const result = await service.enrichSchedules(testSchedules, true);

      expect(result).toHaveLength(2);
      
      // Both programs should be live (overlapping at 11:00)
      expect(result[0].program.is_live).toBe(true);
      expect(result[1].program.is_live).toBe(true);
      
      // Both should have live streams assigned
      expect(result[0].program.live_streams).toBeDefined();
      expect(result[1].program.live_streams).toBeDefined();
      
      // Each program should get 1 stream (stream_count = 1)
      expect(result[0].program.stream_count).toBe(1);
      expect(result[1].program.stream_count).toBe(1);
      
    });

    it('should skip title matching when only one program and one stream exist', async () => {
      const testSchedules = [
        {
          id: 1,
          program_id: '1',
          day_of_week: 'monday',
          start_time: '10:00',
          end_time: '12:00',
          program: {
            id: 1,
            name: 'Dejá que entre el sol', // Different name from YouTube title
            description: 'Description A',
            logo_url: 'logo-a.png',
            youtube_url: 'https://youtube.com/program-a',
            is_live: false,
            stream_url: '',
            style_override: null,
            channel: {
              id: 1,
              name: 'Vorterix',
              description: 'Test Description',
              logo_url: 'test-logo.png',
              handle: 'vorterix',
              youtube_channel_id: 'vorterix-channel-id',
              order: 1,
              is_visible: true,
              background_color: '#ff0000',
              show_only_when_scheduled: false,
              programs: [],
            },
            panelists: [],
            schedules: [],
          },
        },
      ];

      const mockStreams = {
        streams: [
          {
            videoId: 'IDJ6Wn4DBQ4',
            title: '🔴 MAÑANA VA A ESTAR BUENO con Pablo Kenny | VORTERIX EN VIVO', // Different from program name
            description: 'Test description',
            thumbnailUrl: 'test-thumb.jpg',
            publishedAt: '2025-10-02T10:18:19Z',
            channelTitle: 'Vorterix'
          }
        ],
        primaryVideoId: 'IDJ6Wn4DBQ4',
        streamCount: 1
      };

      // Mock config service
      jest.spyOn(configService, 'canFetchLive').mockResolvedValue(true);
      
      // Mock YouTube service
      jest.spyOn(youtubeLiveService, 'getLiveStreams').mockResolvedValue(mockStreams);

      const result = await service.enrichSchedules(testSchedules, true);

      expect(result).toHaveLength(1);
      
      // Should use the stream even though titles don't match
      expect(result[0].program.stream_url).toBe('https://www.youtube.com/embed/IDJ6Wn4DBQ4?autoplay=1');
      expect(result[0].program.is_live).toBe(true);
      expect(result[0].program.live_streams).toHaveLength(1);
      expect(result[0].program.live_streams[0].videoId).toBe('IDJ6Wn4DBQ4');
      expect(result[0].program.stream_count).toBe(1);
    });

    it('should handle single program with multiple available streams', async () => {
      const testSchedule = {
        id: 1,
        day_of_week: 'monday',
        start_time: '10:00',
        end_time: '12:00',
        program: {
          id: 1,
          name: 'Live Stream 1',
          description: 'Description A',
          logo_url: 'logo-a.png',
          youtube_url: 'https://youtube.com/program-a',
          is_live: false,
          stream_url: '',
          channel: {
            id: 1,
            name: 'Test Channel',
            description: 'Test Description',
            logo_url: 'test-logo.png',
            handle: 'testchannel',
            youtube_channel_id: 'test-channel-id',
            programs: [],
          },
          panelists: [],
          schedules: [],
        },
      } as unknown as Schedule;

      const mockStreams = {
        streams: [
          {
            videoId: 'stream1',
            title: 'Live Stream 1',
            publishedAt: '2023-01-01T00:00:00Z',
            description: 'Stream 1 Description',
            thumbnailUrl: 'thumb1.jpg',
            channelTitle: 'Test Channel'
          },
          {
            videoId: 'stream2',
            title: 'Live Stream 2',
            publishedAt: '2023-01-01T01:00:00Z',
            description: 'Stream 2 Description',
            thumbnailUrl: 'thumb2.jpg',
            channelTitle: 'Test Channel'
          }
        ],
        primaryVideoId: 'stream1',
        streamCount: 2
      };

      // Mock config service
      jest.spyOn(configService, 'canFetchLive').mockResolvedValue(true);
      
      // Mock YouTube service
      jest.spyOn(youtubeLiveService, 'getLiveStreams').mockResolvedValue(mockStreams);

      const result = await service.enrichSchedules([testSchedule], true);

      expect(result).toHaveLength(1);
      
      // Program should be live
      expect(result[0].program.is_live).toBe(true);
      
      // Should get 1 stream assigned (best match)
      expect(result[0].program.stream_count).toBe(1);
      expect(result[0].program.live_streams).toHaveLength(1);
      
    });

    it('should use getLiveStreams to enrich live programs', async () => {
      const testSchedule = {
        id: 1,
        day_of_week: 'monday',
        start_time: '10:00',
        end_time: '12:00',
        program: {
          id: 1,
          name: 'Live Stream',
          description: 'Description A',
          logo_url: 'logo-a.png',
          youtube_url: 'https://youtube.com/program-a',
          is_live: false,
          stream_url: '',
          channel: {
            id: 1,
            name: 'Test Channel',
            description: 'Test Description',
            logo_url: 'test-logo.png',
            handle: 'testchannel',
            youtube_channel_id: 'test-channel-id',
            programs: [],
          },
          panelists: [],
          schedules: [],
        },
      } as unknown as Schedule;

      // Mock config service
      jest.spyOn(configService, 'canFetchLive').mockResolvedValue(true);
      
      // Mock YouTube service - getLiveStreams returns actual stream data
      jest.spyOn(youtubeLiveService, 'getLiveStreams').mockResolvedValue({
        streams: [{
          videoId: 'fallback-video-id',
          title: 'Live Stream',
          publishedAt: new Date().toISOString(),
          description: '',
          channelTitle: 'Test Channel'
        }],
        primaryVideoId: 'fallback-video-id',
        streamCount: 1
      });

      const result = await service.enrichSchedules([testSchedule], true);

      expect(result).toHaveLength(1);
      
      // Program should be live
      expect(result[0].program.is_live).toBe(true);
      
      // Should use stream video ID
      expect(result[0].program.stream_url).toBe('https://www.youtube.com/embed/fallback-video-id?autoplay=1');
      
      // Should have live_streams from getLiveStreams
      expect(result[0].program.live_streams).toHaveLength(1);
      expect(result[0].program.live_streams[0].videoId).toBe('fallback-video-id');
      expect(result[0].program.stream_count).toBe(1);
    });

    it('should handle programs without channel info (individual enrichment)', async () => {
      const testSchedule = {
        id: 1,
        day_of_week: 'monday',
        start_time: '10:00',
        end_time: '12:00',
        program: {
          id: 1,
          name: 'Test Program',
          description: 'Description A',
          logo_url: 'logo-a.png',
          youtube_url: 'https://youtube.com/program-a',
          is_live: false,
          stream_url: '',
          channel: {
            id: 1,
            name: 'Test Channel',
            description: 'Test Description',
            logo_url: 'test-logo.png',
            handle: null, // No handle
            youtube_channel_id: null, // No channel ID
            programs: [],
          },
          panelists: [],
          schedules: [],
        },
      } as unknown as Schedule;

      const result = await service.enrichSchedules([testSchedule], true);

      expect(result).toHaveLength(1);
      
      // Program should be live (time-based)
      expect(result[0].program.is_live).toBe(true);
      
      // Should use original stream_url/youtube_url (no live stream fetching)
      expect(result[0].program.stream_url).toBe('https://youtube.com/program-a');
      
      // Should have no live streams data
      expect(result[0].program.live_streams).toBeNull();
      expect(result[0].program.stream_count).toBe(0);
    });

    it('should not fetch live streams when liveStatus is false', async () => {
      const testSchedule = {
        id: 1,
        day_of_week: 'monday',
        start_time: '10:00',
        end_time: '12:00',
        program: {
          id: 1,
          name: 'Test Program',
          description: 'Description A',
          logo_url: 'logo-a.png',
          youtube_url: 'https://youtube.com/program-a',
          is_live: false,
          stream_url: '',
          channel: {
            id: 1,
            name: 'Test Channel',
            description: 'Test Description',
            logo_url: 'test-logo.png',
            handle: 'testchannel',
            youtube_channel_id: 'test-channel-id',
            programs: [],
          },
          panelists: [],
          schedules: [],
        },
      } as unknown as Schedule;

      // Mock config service
      jest.spyOn(configService, 'canFetchLive').mockResolvedValue(true);
      
      // Mock YouTube service
      const getLiveStreamsSpy = jest.spyOn(youtubeLiveService, 'getLiveStreams').mockResolvedValue({
        streams: [],
        primaryVideoId: null,
        streamCount: 0
      });
      const getLiveVideoIdSpy = jest.spyOn(youtubeLiveService, 'getLiveVideoId').mockResolvedValue('video-id');

      const result = await service.enrichSchedules([testSchedule], false); // liveStatus = false

      expect(result).toHaveLength(1);
      
      // Program should be live (time-based)
      expect(result[0].program.is_live).toBe(true);
      
      // Should use original stream_url/youtube_url (no live stream fetching)
      expect(result[0].program.stream_url).toBe('https://youtube.com/program-a');
      
      // YouTube service should not be called
      expect(getLiveStreamsSpy).not.toHaveBeenCalled();
      expect(getLiveVideoIdSpy).not.toHaveBeenCalled();
    });
  });
});
