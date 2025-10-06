import { TimezoneUtil } from './timezone.util';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';

// Mock dayjs
jest.mock('dayjs', () => {
  const mockDayjs = jest.fn(() => ({
    tz: jest.fn().mockReturnThis(),
    hour: jest.fn().mockReturnValue(15),
    minute: jest.fn().mockReturnValue(30),
    format: jest.fn().mockImplementation((format: string) => {
      if (format === 'dddd') return 'monday';
      if (format === 'HH:mm:ss') return '15:30:00';
      if (format === 'YYYY-MM-DD') return '2024-01-15';
      if (format === 'Z') return '-03:00';
      if (format === 'YYYY-MM-DD HH:mm:ss') return '2024-01-15 15:30:00';
      return '2024-01-15 15:30:00';
    }),
    startOf: jest.fn().mockReturnThis(),
    endOf: jest.fn().mockReturnThis(),
    add: jest.fn().mockReturnThis(),
    diff: jest.fn().mockReturnValue(3600), // 1 hour in seconds
    isAfter: jest.fn().mockReturnValue(true),
    isBefore: jest.fn().mockReturnValue(false),
  }));
  
  // Add static methods to the mock function
  (mockDayjs as any).extend = jest.fn();
  (mockDayjs as any).tz = jest.fn().mockReturnThis();
  
  return mockDayjs;
});

describe('TimezoneUtil', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('now', () => {
    it('should return current time in Argentina timezone', () => {
      const result = TimezoneUtil.now();
      
      expect(dayjs).toHaveBeenCalled();
      expect(result.tz).toHaveBeenCalledWith('America/Argentina/Buenos_Aires');
    });
  });

  describe('toArgentinaTime', () => {
    it('should convert date to Argentina timezone', () => {
      const testDate = new Date('2024-01-15T18:30:00Z');
      const result = TimezoneUtil.toArgentinaTime(testDate);
      
      expect(dayjs).toHaveBeenCalledWith(testDate);
      expect(result.tz).toHaveBeenCalledWith('America/Argentina/Buenos_Aires');
    });

    it('should handle string input', () => {
      const testString = '2024-01-15T18:30:00Z';
      const result = TimezoneUtil.toArgentinaTime(testString);
      
      expect(dayjs).toHaveBeenCalledWith(testString);
      expect(result.tz).toHaveBeenCalledWith('America/Argentina/Buenos_Aires');
    });
  });

  describe('currentTimeString', () => {
    it('should return formatted time string', () => {
      const result = TimezoneUtil.currentTimeString();
      
      expect(result).toBe('15:30:00');
    });
  });

  describe('currentDayOfWeek', () => {
    it('should return current day of week in lowercase', () => {
      const result = TimezoneUtil.currentDayOfWeek();
      
      expect(result).toBe('monday');
    });
  });

  describe('currentDateString', () => {
    it('should return formatted date string', () => {
      const result = TimezoneUtil.currentDateString();
      
      expect(result).toBe('2024-01-15');
    });
  });

  describe('currentTimeInMinutes', () => {
    it('should return current time in minutes since midnight', () => {
      const result = TimezoneUtil.currentTimeInMinutes();
      
      // 15 hours * 60 + 30 minutes = 930 minutes
      expect(result).toBe(930);
    });
  });

  describe('todayAtTime', () => {
    it('should create moment for today at specific time', () => {
      const result = TimezoneUtil.todayAtTime('14:30');
      
      expect(dayjs).toHaveBeenCalled();
      expect(result.startOf).toHaveBeenCalledWith('day');
      expect(result.add).toHaveBeenCalledWith(14, 'hour');
      expect(result.add).toHaveBeenCalledWith(30, 'minute');
    });
  });

  describe('ttlUntilTime', () => {
    it('should calculate TTL until specific time', () => {
      const result = TimezoneUtil.ttlUntilTime('16:30');
      
      expect(result).toBe(3600); // Mocked diff result
    });
  });

  describe('ttlUntilEndOfDay', () => {
    it('should calculate TTL until end of day', () => {
      const result = TimezoneUtil.ttlUntilEndOfDay();
      
      expect(result).toBe(3600); // Mocked diff result
    });
  });

  describe('formatForLogging', () => {
    it('should format moment for logging with timezone info', () => {
      const mockMoment = {
        format: jest.fn().mockImplementation((format: string) => {
          if (format === 'YYYY-MM-DD HH:mm:ss') return '2024-01-15 15:30:00';
          if (format === 'Z') return '-03:00';
          return '2024-01-15 15:30:00';
        }),
      };
      
      const result = TimezoneUtil.formatForLogging(mockMoment as any);
      
      expect(result).toBe('2024-01-15 15:30:00 (-03:00)');
    });
  });

  describe('isWithinTimeRange', () => {
    it('should check if current time is within range', () => {
      const result = TimezoneUtil.isWithinTimeRange('14:00', '16:00');
      
      expect(result).toBe(false); // Mocked isAfter/isBefore results
    });
  });

  describe('getTimezone', () => {
    it('should return Argentina timezone string', () => {
      const result = TimezoneUtil.getTimezone();
      
      expect(result).toBe('America/Argentina/Buenos_Aires');
    });
  });
});
