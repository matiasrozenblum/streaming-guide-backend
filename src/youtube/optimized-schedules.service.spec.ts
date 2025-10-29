import { Test, TestingModule } from '@nestjs/testing';
import { OptimizedSchedulesService } from './optimized-schedules.service';
import { SchedulesService } from '../schedules/schedules.service';
import { WeeklyOverridesService } from '../schedules/weekly-overrides.service';
import { LiveStatusBackgroundService } from './live-status-background.service';
import { YoutubeLiveService } from './youtube-live.service';
import { RedisService } from '../redis/redis.service';

// Mock TimezoneUtil
jest.mock('../utils/timezone.util', () => ({
  TimezoneUtil: {
    currentDayOfWeek: jest.fn().mockReturnValue('monday'),
    currentTimeInMinutes: jest.fn().mockReturnValue(630), // 10:30 AM
  },
}));
 
describe('OptimizedSchedulesService', () => {
  let service: OptimizedSchedulesService;
  let mockSchedulesService: any;
  let mockLiveStatusBackgroundService: any;

  beforeEach(async () => {
    mockSchedulesService = {
      findAll: jest.fn().mockResolvedValue([
        {
          id: 1,
          day_of_week: 'monday',
          start_time: '10:00',
          end_time: '12:00',
          program: {
            id: 1,
            name: 'Test Program',
            channel: {
              id: 1,
              name: 'Test Channel',
              youtube_channel_id: 'test-channel-id',
              handle: 'testchannel',
            },
          },
        },
      ]),
    };

    mockLiveStatusBackgroundService = {
      getLiveStatusForChannels: jest.fn().mockResolvedValue(
        new Map([
          ['testchannel', {
            channelId: 'test-channel-id',
            handle: 'testchannel',
            isLive: true,
            streamUrl: 'https://www.youtube.com/embed/test-video?autoplay=1',
            videoId: 'test-video',
            lastUpdated: Date.now(),
            ttl: 300,
          }],
        ])
      ),
    };

    const mockRedisService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      delByPattern: jest.fn(),
    };

    const mockYoutubeLiveService = {
      getLiveStreams: jest.fn().mockResolvedValue({
        streams: [],
        __SKIPPED__: true,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OptimizedSchedulesService,
        { provide: SchedulesService, useValue: mockSchedulesService },
        { provide: WeeklyOverridesService, useValue: { 
          applyWeeklyOverrides: jest.fn().mockImplementation((schedules) => Promise.resolve(schedules)),
          getWeekStartDate: jest.fn().mockReturnValue('2024-01-01')
        } },
        { provide: LiveStatusBackgroundService, useValue: mockLiveStatusBackgroundService },
        { provide: YoutubeLiveService, useValue: mockYoutubeLiveService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<OptimizedSchedulesService>(OptimizedSchedulesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should get schedules without live status quickly', async () => {
    const startTime = Date.now();
    const result = await service.getSchedulesWithOptimizedLiveStatus({
      liveStatus: false,
    });
    const duration = Date.now() - startTime;

    expect(result).toHaveLength(1);
    expect(duration).toBeLessThan(100); // Should be very fast without live status
    expect(mockLiveStatusBackgroundService.getLiveStatusForChannels).not.toHaveBeenCalled();
  });

  it('should get schedules with live status using background cache', async () => {
    const startTime = Date.now();
    const result = await service.getSchedulesWithOptimizedLiveStatus({
      liveStatus: true,
    });
    const duration = Date.now() - startTime;

    expect(result).toHaveLength(1);
    expect(duration).toBeLessThan(200); // Should be fast with cached live status
    expect(mockLiveStatusBackgroundService.getLiveStatusForChannels).toHaveBeenCalledWith(['testchannel']);
    
    // Check that live status was applied (10:30 is within 10:00-12:00 range)
    expect(result[0].program.is_live).toBe(true);
    expect(result[0].program.stream_url).toBe('https://www.youtube.com/embed/test-video?autoplay=1');
  });
});
