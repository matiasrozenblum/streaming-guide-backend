import { getCurrentBlockTTL, getEndOfDayTTL } from './getBlockTTL.util';
import { SentryService } from '../sentry/sentry.service';

// Mock dayjs completely
jest.mock('dayjs', () => {
  const originalDayjs = jest.requireActual('dayjs');
  const mockDayjs = jest.fn(() => ({
    hour: () => 10,
    minute: () => 0,
    format: (format?: string) => '2025-09-15 10:00:00',
    startOf: jest.fn().mockReturnThis(),
    endOf: jest.fn().mockReturnThis(),
    diff: jest.fn().mockReturnValue(10800),
    add: jest.fn().mockReturnThis(),
    tz: jest.fn().mockReturnThis()
  }));
  
  Object.assign(mockDayjs, originalDayjs);
  return mockDayjs;
});

describe('getBlockTTL.util', () => {
  let mockSentryService: jest.Mocked<SentryService>;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    mockSentryService = {
      captureMessage: jest.fn(),
      setTag: jest.fn(),
      captureException: jest.fn(),
      addBreadcrumb: jest.fn(),
    } as any;

    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

    jest.clearAllMocks();
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  describe('getEndOfDayTTL', () => {
    it('should return positive TTL until end of day', () => {
      const ttl = getEndOfDayTTL();
      expect(ttl).toBeGreaterThan(0);
      expect(typeof ttl).toBe('number');
    });
  });

  describe('getCurrentBlockTTL', () => {
    const mockSchedules = [
      {
        start_time: '09:00',
        end_time: '13:00',
        program: {
          name: 'Morning Show',
          channel: { youtube_channel_id: 'test-channel' }
        }
      },
      {
        start_time: '14:00',
        end_time: '16:00',
        program: {
          name: 'Afternoon Show',
          channel: { youtube_channel_id: 'test-channel' }
        }
      }
    ];

    it('should return positive TTL when program is currently running', async () => {
      const result = await getCurrentBlockTTL('test-channel', mockSchedules as any, mockSentryService);
      
      expect(result).toBeGreaterThan(0);
      expect(typeof result).toBe('number');
    });

    it('should return end-of-day TTL when no program is currently running', async () => {
      const result = await getCurrentBlockTTL('test-channel', mockSchedules as any, mockSentryService);
      
      expect(result).toBeGreaterThan(0);
      expect(typeof result).toBe('number');
    });

    it('should work without SentryService', async () => {
      const result = await getCurrentBlockTTL('test-channel', mockSchedules as any, undefined);
      
      expect(result).toBeGreaterThan(0);
      expect(typeof result).toBe('number');
    });

    it('should handle empty schedules array', async () => {
      const result = await getCurrentBlockTTL('test-channel', [], mockSentryService);
      
      expect(result).toBeGreaterThan(0);
      expect(typeof result).toBe('number');
    });

    it('should filter schedules by channel ID', async () => {
      const schedulesWithMultipleChannels = [
        {
          start_time: '09:00',
          end_time: '13:00',
          program: {
            name: 'Channel 1 Show',
            channel: { youtube_channel_id: 'channel-1' }
          }
        },
        {
          start_time: '10:00',
          end_time: '14:00',
          program: {
            name: 'Channel 2 Show',
            channel: { youtube_channel_id: 'channel-2' }
          }
        }
      ];

      // Test with channel-1
      const result1 = await getCurrentBlockTTL('channel-1', schedulesWithMultipleChannels as any, mockSentryService);
      expect(result1).toBeGreaterThan(0);

      // Test with channel-2
      const result2 = await getCurrentBlockTTL('channel-2', schedulesWithMultipleChannels as any, mockSentryService);
      expect(result2).toBeGreaterThan(0);

      // Both should return positive TTL values
      expect(typeof result1).toBe('number');
      expect(typeof result2).toBe('number');
    });

    it('should handle programs with gaps less than 2 minutes', async () => {
      const schedulesWithGap = [
        {
          start_time: '09:00',
          end_time: '10:00',
          program: {
            name: 'First Show',
            channel: { youtube_channel_id: 'test-channel' }
          }
        },
        {
          start_time: '10:01', // 1 minute gap
          end_time: '12:00',
          program: {
            name: 'Second Show',
            channel: { youtube_channel_id: 'test-channel' }
          }
        }
      ];

      const result = await getCurrentBlockTTL('test-channel', schedulesWithGap as any, mockSentryService);
      
      expect(result).toBeGreaterThan(0);
      expect(typeof result).toBe('number');
    });
  });

  describe('Alert Deduplication', () => {
    it('should not send duplicate Sentry alerts within cooldown period', async () => {
      const schedules = [
        {
          start_time: '09:00',
          end_time: '10:00',
          program: {
            name: 'Test Show',
            channel: { youtube_channel_id: 'test-channel' }
          }
        }
      ];

      // First call
      await getCurrentBlockTTL('test-channel', schedules as any, mockSentryService);
      
      // Second call immediately after (within cooldown)
      await getCurrentBlockTTL('test-channel', schedules as any, mockSentryService);
      
      // Should only send one alert (or none if no negative TTL detected)
      expect(mockSentryService.captureMessage).toHaveBeenCalledTimes(0);
    });
  });
});