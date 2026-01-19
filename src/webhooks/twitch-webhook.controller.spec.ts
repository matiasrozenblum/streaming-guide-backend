import { Test, TestingModule } from '@nestjs/testing';
import { TwitchWebhookController } from './twitch-webhook.controller';
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

describe('TwitchWebhookController', () => {
  let controller: TwitchWebhookController;
  let streamerLiveStatusService: StreamerLiveStatusService;
  let streamersService: StreamersService;

  const mockStreamer: Streamer = {
    id: 1,
    name: 'Test Streamer',
    logo_url: 'https://test.com/logo.png',
    is_visible: true,
    order: 1,
    services: [
      {
        service: 'twitch',
        url: 'https://twitch.tv/testuser',
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
      controllers: [TwitchWebhookController],
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

    controller = module.get<TwitchWebhookController>(TwitchWebhookController);
    streamerLiveStatusService = module.get<StreamerLiveStatusService>(StreamerLiveStatusService);
    streamersService = module.get<StreamersService>(StreamersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('verifyWebhook', () => {
    it('should return challenge for subscription verification', async () => {
      const req = {
        query: {
          'hub.mode': 'subscribe',
          'hub.challenge': 'test-challenge-123',
          'hub.topic': 'https://api.twitch.tv/helix/eventsub/subscriptions',
        },
      } as any;

      const res = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      } as any;

      await controller.verifyWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith('test-challenge-123');
    });

    it('should return 400 for invalid verification request', async () => {
      const req = {
        query: {
          'hub.mode': 'invalid',
        },
      } as any;

      const res = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      } as any;

      await controller.verifyWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith('Invalid verification request');
    });
  });

  describe('handleWebhook', () => {
    it('should handle stream.online event and update live status', async () => {
      const notification = {
        subscription: {
          id: 'sub-123',
          status: 'enabled',
          type: 'stream.online',
          version: '1',
        },
        event: {
          broadcaster_user_id: '123',
          broadcaster_user_login: 'testuser',
          broadcaster_user_name: 'TestUser',
          type: 'live',
          started_at: new Date().toISOString(),
        },
      };

      const req = {
        body: notification,
        rawBody: JSON.stringify(notification),
      } as any;

      const headers = {
        'twitch-eventsub-message-signature': 'sha256=test',
        'twitch-eventsub-message-id': 'msg-123',
        'twitch-eventsub-message-timestamp': Date.now().toString(),
        'twitch-eventsub-message-type': 'notification',
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      } as any;

      // Mock signature verification to pass (in real scenario, this would verify)
      jest.spyOn(controller as any, 'verifySignature').mockReturnValue(true);

      await controller.handleWebhook(
        headers['twitch-eventsub-message-signature'],
        headers['twitch-eventsub-message-id'],
        headers['twitch-eventsub-message-timestamp'],
        headers['twitch-eventsub-message-type'],
        notification,
        req,
        res
      );

      expect(res.status).toHaveBeenCalledWith(204);

      expect(streamerLiveStatusService.updateLiveStatus).toHaveBeenCalledWith(
        1,
        'twitch',
        true,
        'testuser'
      );
    });

    it('should handle stream.offline event and update live status', async () => {
      const notification = {
        subscription: {
          id: 'sub-123',
          status: 'enabled',
          type: 'stream.offline',
          version: '1',
        },
        event: {
          broadcaster_user_id: '123',
          broadcaster_user_login: 'testuser',
          broadcaster_user_name: 'TestUser',
          type: 'offline',
          ended_at: new Date().toISOString(),
        },
      };

      const req = {
        body: notification,
        rawBody: JSON.stringify(notification),
      } as any;

      const headers = {
        'twitch-eventsub-message-signature': 'sha256=test',
        'twitch-eventsub-message-id': 'msg-123',
        'twitch-eventsub-message-timestamp': Date.now().toString(),
        'twitch-eventsub-message-type': 'notification',
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      } as any;

      jest.spyOn(controller as any, 'verifySignature').mockReturnValue(true);

      await controller.handleWebhook(
        headers['twitch-eventsub-message-signature'],
        headers['twitch-eventsub-message-id'],
        headers['twitch-eventsub-message-timestamp'],
        headers['twitch-eventsub-message-type'],
        notification,
        req,
        res
      );

      expect(res.status).toHaveBeenCalledWith(204);

      expect(streamerLiveStatusService.updateLiveStatus).toHaveBeenCalledWith(
        1,
        'twitch',
        false,
        'testuser'
      );
    });

    it('should handle webhook callback verification', async () => {
      const notification = {
        subscription: {
          id: 'sub-123',
          status: 'webhook_callback_verification',
          type: 'stream.online',
          version: '1',
        },
        challenge: 'verification-challenge-123',
      };

      const req = {
        body: notification,
        rawBody: JSON.stringify(notification),
      } as any;

      const headers = {
        'twitch-eventsub-message-signature': 'sha256=test',
        'twitch-eventsub-message-id': 'msg-123',
        'twitch-eventsub-message-timestamp': Date.now().toString(),
        'twitch-eventsub-message-type': 'webhook_callback_verification',
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        send: jest.fn(),
      } as any;

      jest.spyOn(controller as any, 'verifySignature').mockReturnValue(true);

      await controller.handleWebhook(
        headers['twitch-eventsub-message-signature'],
        headers['twitch-eventsub-message-id'],
        headers['twitch-eventsub-message-timestamp'],
        headers['twitch-eventsub-message-type'],
        notification,
        req,
        res
      );

      expect(res.set).toHaveBeenCalledWith('Content-Type', 'text/plain');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith('verification-challenge-123');
      expect(streamerLiveStatusService.updateLiveStatus).not.toHaveBeenCalled();
    });
  });
});

