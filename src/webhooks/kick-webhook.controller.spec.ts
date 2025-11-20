import { Test, TestingModule } from '@nestjs/testing';
import { KickWebhookController } from './kick-webhook.controller';
import { StreamerLiveStatusService } from '../streamers/streamer-live-status.service';
import { StreamersService } from '../streamers/streamers.service';
import { RedisService } from '../redis/redis.service';
import { Streamer } from '../streamers/streamers.entity';
import { NotifyAndRevalidateUtil } from '../utils/notify-and-revalidate.util';

// Mock the NotifyAndRevalidateUtil
jest.mock('../utils/notify-and-revalidate.util', () => ({
  NotifyAndRevalidateUtil: jest.fn().mockImplementation(() => ({
    notifyAndRevalidate: jest.fn().mockResolvedValue(undefined),
  })),
}));

describe('KickWebhookController', () => {
  let controller: KickWebhookController;
  let streamerLiveStatusService: StreamerLiveStatusService;
  let streamersService: StreamersService;

  const mockStreamer: Streamer = {
    id: 1,
    name: 'Test Streamer',
    logo_url: 'https://test.com/logo.png',
    is_visible: true,
    services: [
      {
        service: 'kick',
        url: 'https://kick.com/testuser',
        username: 'testuser',
      },
    ],
    categories: [],
  };

  const mockStreamerLiveStatusService = {
    updateLiveStatus: jest.fn(),
  };

  const mockStreamersService = {
    findAll: jest.fn().mockResolvedValue([mockStreamer]),
  };

  const mockRedisService = {
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    client: {
      keys: jest.fn().mockResolvedValue([]),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [KickWebhookController],
      providers: [
        {
          provide: StreamerLiveStatusService,
          useValue: mockStreamerLiveStatusService,
        },
        {
          provide: StreamersService,
          useValue: mockStreamersService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    controller = module.get<KickWebhookController>(KickWebhookController);
    streamerLiveStatusService = module.get<StreamerLiveStatusService>(StreamerLiveStatusService);
    streamersService = module.get<StreamersService>(StreamersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('handleWebhook', () => {
    it('should handle live webhook and update live status', async () => {
      const payload = {
        broadcaster: {
          user_id: 123,
          username: 'testuser',
          is_verified: true,
          profile_picture: 'https://test.com/pic.png',
          channel_slug: 'testuser',
        },
        is_live: true,
        title: 'Test Stream',
        started_at: new Date().toISOString(),
      };

      const req = {
        body: payload,
        rawBody: JSON.stringify(payload),
      } as any;

      jest.spyOn(controller as any, 'verifySignature').mockReturnValue(true);

      const result = await controller.handleWebhook('sha256=test', payload, req);

      expect(result).toEqual({ success: true });
      expect(streamerLiveStatusService.updateLiveStatus).toHaveBeenCalledWith(
        1,
        'kick',
        true,
        'testuser'
      );
    });

    it('should handle offline webhook and update live status', async () => {
      const payload = {
        broadcaster: {
          user_id: 123,
          username: 'testuser',
          is_verified: true,
          profile_picture: 'https://test.com/pic.png',
          channel_slug: 'testuser',
        },
        is_live: false,
        ended_at: new Date().toISOString(),
      };

      const req = {
        body: payload,
        rawBody: JSON.stringify(payload),
      } as any;

      jest.spyOn(controller as any, 'verifySignature').mockReturnValue(true);

      const result = await controller.handleWebhook('sha256=test', payload, req);

      expect(result).toEqual({ success: true });
      expect(streamerLiveStatusService.updateLiveStatus).toHaveBeenCalledWith(
        1,
        'kick',
        false,
        'testuser'
      );
    });

    it('should return error when streamer not found', async () => {
      const payload = {
        broadcaster: {
          user_id: 123,
          username: 'unknownuser',
          is_verified: true,
          profile_picture: 'https://test.com/pic.png',
          channel_slug: 'unknownuser',
        },
        is_live: true,
      };

      const req = {
        body: payload,
        rawBody: JSON.stringify(payload),
      } as any;

      jest.spyOn(controller as any, 'verifySignature').mockReturnValue(true);

      const result = await controller.handleWebhook('sha256=test', payload, req);

      expect(result).toEqual({ success: false, error: 'Streamer not found' });
      expect(streamerLiveStatusService.updateLiveStatus).not.toHaveBeenCalled();
    });

    it('should return error when payload is invalid', async () => {
      const payload = {
        // Missing broadcaster
      } as any;

      const req = {
        body: payload,
        rawBody: JSON.stringify(payload),
      } as any;

      jest.spyOn(controller as any, 'verifySignature').mockReturnValue(true);

      const result = await controller.handleWebhook('sha256=test', payload, req);

      expect(result).toEqual({ success: false, error: 'Invalid payload' });
      expect(streamerLiveStatusService.updateLiveStatus).not.toHaveBeenCalled();
    });
  });
});

