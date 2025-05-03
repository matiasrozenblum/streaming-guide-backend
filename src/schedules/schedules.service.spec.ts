import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SchedulesService } from './schedules.service';
import { Schedule } from './schedules.entity';
import { Program } from '../programs/programs.entity';
import { RedisService } from '../redis/redis.service';
import { YoutubeLiveService } from '../youtube/youtube-live.service';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

let currentTime = '15:00';
let currentDay = 'monday';
let qbChain: any;

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

    qbChain = {
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawMany: jest.fn(),
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
            createQueryBuilder: jest.fn(() => qbChain),
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
        ...mockSchedule,
        start_time: '10:00',
        end_time: '12:00',
        program: {
          ...mockProgram,
          is_live: false,
          stream_url: 'https://youtube.com/test'
        }
      } as unknown as Schedule;

      jest.spyOn(redisService, 'get').mockResolvedValueOnce(null).mockResolvedValueOnce('live-video-id');
      qbChain.getRawMany.mockResolvedValueOnce([
        {
          s_id: 1,
          s_day_of_week: 'monday',
          s_start_time: '10:00',
          s_end_time: '12:00',
          p_id: 1,
          p_name: 'Test Program',
          p_logoUrl: 'test-logo.png',
          p_description: 'Test Description',
          p_youtubeUrl: 'https://youtube.com/test',
          c_id: 1,
          c_name: 'Test Channel',
          c_logoUrl: 'test-logo.png',
          c_youtubeChannelId: 'test-channel-id',
          c_handle: 'test',
          pl_id: null,
          pl_name: null,
        },
      ]);

      currentTime = '11:00';
      currentDay = 'monday';

      const result = await service.findByDay('monday');

      expect(result).toHaveLength(1);
      expect(result[0].program.is_live).toBe(true);
      expect(result[0].program.stream_url).toBe('https://www.youtube.com/embed/live-video-id?autoplay=1');
    });

    it('should not mark program as live if outside time', async () => {
      const testSchedule = {
        ...mockSchedule,
        start_time: '08:00',
        end_time: '10:00',
        program: {
          ...mockProgram,
          is_live: false,
          stream_url: 'https://youtube.com/test'
        }
      } as unknown as Schedule;

      jest.spyOn(redisService, 'get').mockResolvedValueOnce(null);
      qbChain.getRawMany.mockResolvedValueOnce([
        {
          s_id: 1,
          s_day_of_week: 'monday',
          s_start_time: '08:00',
          s_end_time: '10:00',
          p_id: 1,
          p_name: 'Test Program',
          p_logoUrl: 'test-logo.png',
          p_description: 'Test Description',
          p_youtubeUrl: 'https://youtube.com/test',
          c_id: 1,
          c_name: 'Test Channel',
          c_logoUrl: 'test-logo.png',
          c_youtubeChannelId: 'test-channel-id',
          c_handle: 'test',
          pl_id: null,
          pl_name: null,
        },
      ]);

      currentTime = '15:00'; // fuera de rango
      currentDay = 'monday';

      const result = await service.findByDay('monday');

      expect(result[0].program.is_live).toBe(false);
      expect(result[0].program.stream_url).toBe('https://youtube.com/test');
    });
  });
});
