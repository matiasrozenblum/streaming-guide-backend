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

  const mockChannel = {
    id: 1,
    name: 'Test Channel',
    description: 'Test Description',
    logo_url: 'test-logo.png',
    handle: 'test',
    youtube_channel_id: 'test-channel-id',
    programs: [],
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
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([mockSchedule]),
      getOne: jest.fn().mockResolvedValue(mockSchedule),
    };

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
          },
        },
        {
          provide: YoutubeLiveService,
          useValue: {
            getLiveVideoId: jest.fn(),
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
      ],
    }).compile();

    service = module.get<SchedulesService>(SchedulesService);
    schedulesRepo = module.get<Repository<Schedule>>(getRepositoryToken(Schedule));
    programsRepo = module.get<Repository<Program>>(getRepositoryToken(Program));
    redisService = module.get<RedisService>(RedisService);
    youtubeLiveService = module.get<YoutubeLiveService>(YoutubeLiveService);
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
      jest.spyOn(redisService, 'get').mockResolvedValueOnce(null).mockResolvedValueOnce('live-video-id');

      currentTime = '11:00';
      currentDay = 'monday';

      const result = await service.findByDay('monday');

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
});
