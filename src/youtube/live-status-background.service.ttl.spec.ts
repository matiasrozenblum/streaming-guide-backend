import { Test, TestingModule } from '@nestjs/testing';
import { LiveStatusBackgroundService } from './live-status-background.service';
import { YoutubeLiveService } from './youtube-live.service';
import { SchedulesService } from '../schedules/schedules.service';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '../config/config.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Channel } from '../channels/channels.entity';

describe('LiveStatusBackgroundService Block End Time Calculation', () => {
  let service: LiveStatusBackgroundService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LiveStatusBackgroundService,
        { provide: YoutubeLiveService, useValue: { isVideoLive: jest.fn() } },
        { provide: SchedulesService, useValue: { findByDay: jest.fn() } },
        { provide: RedisService, useValue: { get: jest.fn(), set: jest.fn() } },
        { provide: ConfigService, useValue: { canFetchLive: jest.fn() } },
        { provide: getRepositoryToken(Channel), useValue: { find: jest.fn() } },
      ],
    }).compile();

    service = module.get<LiveStatusBackgroundService>(LiveStatusBackgroundService);
  });

  it('should calculate block end time for Vorterix 8 AM - 8 PM stream', () => {
    const vorterixSchedules = [
      { start_time: '08:00', end_time: '20:00' } // 8:00 AM - 8:00 PM
    ];
    const currentTime = 8 * 60; // 8:00 AM in minutes
    
    // Access the private method for testing
    const blockEndTime = (service as any).calculateBlockEndTime(vorterixSchedules, currentTime);
    
    // Should return 8:00 PM (20:00) in minutes = 1200 minutes
    expect(blockEndTime).toBe(20 * 60); // 1200 minutes
  });

  it('should calculate block end time for back-to-back programs', () => {
    const backToBackSchedules = [
      { start_time: '08:00', end_time: '10:00' }, // 8:00 AM - 10:00 AM
      { start_time: '10:00', end_time: '12:00' }, // 10:00 AM - 12:00 PM (no gap)
      { start_time: '12:00', end_time: '14:00' }  // 12:00 PM - 2:00 PM (no gap)
    ];
    const currentTime = 9 * 60; // 9:00 AM in minutes (during first program)
    
    const blockEndTime = (service as any).calculateBlockEndTime(backToBackSchedules, currentTime);
    
    // Should return the end of the entire block (2:00 PM) = 840 minutes
    expect(blockEndTime).toBe(14 * 60); // 840 minutes
  });

  it('should handle programs with gaps correctly', () => {
    const schedulesWithGap = [
      { start_time: '08:00', end_time: '10:00' }, // 8:00 AM - 10:00 AM
      { start_time: '10:30', end_time: '12:00' }  // 10:30 AM - 12:00 PM (30 min gap)
    ];
    const currentTime = 9 * 60; // 9:00 AM in minutes (during first program)
    
    const blockEndTime = (service as any).calculateBlockEndTime(schedulesWithGap, currentTime);
    
    // Should return only the first program end (10:00 AM) = 600 minutes
    // Gap is > 2 minutes, so it doesn't extend the block
    expect(blockEndTime).toBe(10 * 60); // 600 minutes
  });

  it('should return end of day for no matching programs', () => {
    const schedules = [
      { start_time: '14:00', end_time: '16:00' } // 2:00 PM - 4:00 PM
    ];
    const currentTime = 10 * 60; // 10:00 AM in minutes (no program running)
    
    const blockEndTime = (service as any).calculateBlockEndTime(schedules, currentTime);
    
    // Should return end of day (24:00) = 1440 minutes
    expect(blockEndTime).toBe(24 * 60); // 1440 minutes
  });
});
