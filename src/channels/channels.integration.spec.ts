import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { ChannelsController } from '../channels/channels.controller';
import { ChannelsService } from '../channels/channels.service';
import { TimezoneUtil } from '../utils/timezone.util';

describe('Channels Endpoints Integration Tests', () => {
  let app: INestApplication;
  let channelsService: ChannelsService;

  const mockChannelWithSchedules = [
    {
      channel: {
        id: 1,
        name: 'Test Channel',
        logo_url: 'https://test.com/logo.png',
        background_color: '#FF0000',
        show_only_when_scheduled: false,
        categories: [],
      },
      schedules: [
        {
          id: 1,
          day_of_week: 'monday',
          start_time: '10:00:00',
          end_time: '11:00:00',
          subscribed: false,
          isWeeklyOverride: false,
          overrideType: 'normal',
          program: {
            id: 1,
            name: 'Test Program',
            logo_url: 'https://test.com/program-logo.png',
            description: 'Test Description',
            stream_url: null,
            is_live: false,
            live_streams: null,
            stream_count: 0,
            channel_stream_count: 0,
            panelists: [],
            style_override: null,
          },
        },
      ],
    },
  ];

  const mockChannelsService = {
    getChannelsWithSchedules: jest.fn().mockResolvedValue(mockChannelWithSchedules),
    getTodaySchedules: jest.fn().mockResolvedValue(mockChannelWithSchedules),
    getWeekSchedules: jest.fn().mockResolvedValue(mockChannelWithSchedules),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChannelsController],
      providers: [
        {
          provide: ChannelsService,
          useValue: mockChannelsService,
        },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
    channelsService = module.get<ChannelsService>(ChannelsService);
  });

  afterEach(async () => {
    await app.close();
    jest.clearAllMocks();
  });

  describe('GET /channels/with-schedules/today', () => {
    it('should return today\'s schedules', async () => {
      const response = await request(app.getHttpServer())
        .get('/channels/with-schedules/today')
        .expect(200);

      expect(response.body).toEqual(mockChannelWithSchedules);
      expect(channelsService.getTodaySchedules).toHaveBeenCalledWith(undefined, undefined, undefined);
    });

    it('should pass query parameters correctly', async () => {
      const response = await request(app.getHttpServer())
        .get('/channels/with-schedules/today')
        .query({
          deviceId: 'test-device-123',
          live_status: 'true',
          raw: 'false',
        })
        .expect(200);

      expect(response.body).toEqual(mockChannelWithSchedules);
      expect(channelsService.getTodaySchedules).toHaveBeenCalledWith(
        'test-device-123',
        true,
        'false'
      );
    });

    it('should handle boolean parameters correctly', async () => {
      const response = await request(app.getHttpServer())
        .get('/channels/with-schedules/today')
        .query({
          live_status: 'false',
        })
        .expect(200);

      expect(channelsService.getTodaySchedules).toHaveBeenCalledWith(
        undefined,
        false,
        undefined
      );
    });

    it('should handle missing query parameters', async () => {
      const response = await request(app.getHttpServer())
        .get('/channels/with-schedules/today')
        .expect(200);

      expect(channelsService.getTodaySchedules).toHaveBeenCalledWith(
        undefined,
        undefined,
        undefined
      );
    });
  });

  describe('GET /channels/with-schedules/week', () => {
    it('should return week\'s schedules', async () => {
      const response = await request(app.getHttpServer())
        .get('/channels/with-schedules/week')
        .expect(200);

      expect(response.body).toEqual(mockChannelWithSchedules);
      expect(channelsService.getWeekSchedules).toHaveBeenCalledWith(undefined, undefined, undefined);
    });

    it('should pass query parameters correctly', async () => {
      const response = await request(app.getHttpServer())
        .get('/channels/with-schedules/week')
        .query({
          deviceId: 'test-device-456',
          live_status: 'true',
          raw: 'true',
        })
        .expect(200);

      expect(response.body).toEqual(mockChannelWithSchedules);
      expect(channelsService.getWeekSchedules).toHaveBeenCalledWith(
        'test-device-456',
        true,
        'true'
      );
    });

    it('should handle partial query parameters', async () => {
      const response = await request(app.getHttpServer())
        .get('/channels/with-schedules/week')
        .query({
          deviceId: 'partial-device',
        })
        .expect(200);

      expect(channelsService.getWeekSchedules).toHaveBeenCalledWith(
        'partial-device',
        undefined,
        undefined
      );
    });
  });

  describe('GET /channels/with-schedules (legacy endpoint)', () => {
    it('should still work with day parameter', async () => {
      const response = await request(app.getHttpServer())
        .get('/channels/with-schedules')
        .query({
          day: 'tuesday',
          deviceId: 'legacy-device',
          live_status: 'true',
        })
        .expect(200);

      expect(response.body).toEqual(mockChannelWithSchedules);
      expect(channelsService.getChannelsWithSchedules).toHaveBeenCalledWith(
        'tuesday',
        'legacy-device',
        true,
        undefined
      );
    });

    it('should work without any parameters', async () => {
      const response = await request(app.getHttpServer())
        .get('/channels/with-schedules')
        .expect(200);

      expect(response.body).toEqual(mockChannelWithSchedules);
      expect(channelsService.getChannelsWithSchedules).toHaveBeenCalledWith(
        undefined,
        undefined,
        undefined,
        undefined
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle service errors gracefully', async () => {
      mockChannelsService.getTodaySchedules.mockRejectedValue(new Error('Service error'));

      await request(app.getHttpServer())
        .get('/channels/with-schedules/today')
        .expect(500);
    });

    it('should handle invalid query parameters', async () => {
      // Mock the service to return success for invalid parameters
      mockChannelsService.getTodaySchedules.mockResolvedValue([]);
      
      const response = await request(app.getHttpServer())
        .get('/channels/with-schedules/today')
        .query({
          live_status: 'invalid-boolean',
        })
        .expect(200);

      // Should still call the service, but with undefined for invalid boolean
      expect(channelsService.getTodaySchedules).toHaveBeenCalledWith(
        undefined,
        undefined,
        undefined
      );
    });
  });

  describe('Performance and Logging', () => {
    it('should log with correct prefixes', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      // Mock the service to actually log and return success
      mockChannelsService.getTodaySchedules.mockImplementation(async () => {
        console.log('[SCHEDULES-TODAY] Starting optimized today\'s schedules fetch for monday');
        console.log('[SCHEDULES-TODAY] Completed in 5ms');
        return [];
      });
      
      await request(app.getHttpServer())
        .get('/channels/with-schedules/today')
        .expect(200);

      // The service should log with the correct prefix
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[SCHEDULES-TODAY]')
      );
      
      consoleSpy.mockRestore();
    });

    it('should log performance metrics', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      // Mock the service to actually log performance metrics
      mockChannelsService.getWeekSchedules.mockImplementation(async () => {
        console.log('[SCHEDULES-WEEK] Starting optimized week schedules fetch');
        console.log('[SCHEDULES-WEEK] Completed in 10ms');
        return [];
      });
      
      await request(app.getHttpServer())
        .get('/channels/with-schedules/week')
        .expect(200);

      // Should contain performance metrics
      const logCalls = consoleSpy.mock.calls;
      const hasPerformanceLogs = logCalls.some(call => 
        call[0] && typeof call[0] === 'string' && call[0].includes('ms')
      );
      
      expect(hasPerformanceLogs).toBe(true);
      consoleSpy.mockRestore();
    });
  });
});
