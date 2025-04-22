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

// Initialize dayjs plugins for tests
dayjs.extend(utc);
dayjs.extend(timezone);

let currentTime = '15:00';
let currentDay = 'monday';

jest.mock('dayjs', () => {
  const actualDayjs = jest.requireActual('dayjs');
  const mockDayjs = (date?: string | number | Date) => {
    if (typeof date === 'string' && date.includes(':')) {
      const [hours, minutes] = date.split(':').map(Number);
      currentTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
    const instance = actualDayjs(date);
    const mock = {
      ...instance,
      format: jest.fn().mockImplementation((format: string) => {
        if (format === 'dddd') return currentDay;
        if (format === 'HH:mm') return currentTime;
        return currentTime;
      }),
      hour: jest.fn().mockImplementation((hours) => {
        const [_, currentMinutes] = currentTime.split(':').map(Number);
        currentTime = `${hours.toString().padStart(2, '0')}:${currentMinutes.toString().padStart(2, '0')}`;
        return mock;
      }),
      minute: jest.fn().mockImplementation((minutes) => {
        const [currentHours] = currentTime.split(':').map(Number);
        currentTime = `${currentHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        return mock;
      }),
      second: jest.fn().mockReturnThis(),
      millisecond: jest.fn().mockReturnThis(),
      tz: jest.fn().mockReturnThis(),
    };
    return mock;
  };
  mockDayjs.extend = jest.fn();
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
    streaming_url: 'test-stream.com',
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

      jest.spyOn(schedulesRepo, 'find').mockResolvedValue([testSchedule]);
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
        ...mockSchedule,
        start_time: '08:00',
        end_time: '10:00',
        program: {
          ...mockProgram,
          is_live: false,
          stream_url: 'https://youtube.com/test'
        }
      } as unknown as Schedule;

      jest.spyOn(schedulesRepo, 'find').mockResolvedValue([testSchedule]);
      jest.spyOn(redisService, 'get').mockResolvedValueOnce(null);

      currentTime = '15:00';
      currentDay = 'monday';

      const result = await service.findByDay('monday');

      expect(result[0].program.is_live).toBe(false);
      expect(result[0].program.stream_url).toBe('https://youtube.com/test');
    });
  });
});
