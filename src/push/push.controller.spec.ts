import { Test, TestingModule } from '@nestjs/testing';
import { PushController } from './push.controller';
import { PushService } from './push.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('PushController', () => {
  let controller: PushController;
  let pushService: PushService;

  const mockPushService = {
    create: jest.fn(),
    scheduleForProgram: jest.fn(),
    sendNotificationToDevices: jest.fn(),
  };

  const mockNotificationsService = {
    list: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PushController],
      providers: [
        {
          provide: PushService,
          useValue: mockPushService,
        },
        {
          provide: NotificationsService,
          useValue: mockNotificationsService,
        },
      ],
    }).compile();

    controller = module.get<PushController>(PushController);
    pushService = module.get<PushService>(PushService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getVapidPublicKey', () => {
    it('should return VAPID public key', () => {
      const mockKey = 'test-vapid-key';
      process.env.VAPID_PUBLIC_KEY = mockKey;

      const result = controller.getVapidPublicKey();

      expect(result).toEqual({ publicKey: mockKey });
    });

    it('should return undefined when VAPID key is not configured', () => {
      delete process.env.VAPID_PUBLIC_KEY;

      const result = controller.getVapidPublicKey();

      expect(result).toEqual({ publicKey: undefined });
    });
  });

  describe('subscribe', () => {
    it('should create a push subscription', async () => {
      const subscriptionDto = {
        deviceId: 'test-device-id',
        subscription: {
          endpoint: 'https://fcm.googleapis.com/test',
          keys: {
            p256dh: 'test-p256dh',
            auth: 'test-auth',
          },
        },
      };

      const mockSubscription = {
        id: 'sub-1',
        endpoint: subscriptionDto.subscription.endpoint,
        p256dh: subscriptionDto.subscription.keys.p256dh,
        auth: subscriptionDto.subscription.keys.auth,
      };

      mockPushService.create.mockResolvedValue(mockSubscription);

      const result = await controller.subscribe(subscriptionDto);

      expect(mockPushService.create).toHaveBeenCalledWith(subscriptionDto);
      expect(result).toEqual(mockSubscription);
    });

    it('should handle subscription creation errors', async () => {
      const subscriptionDto = {
        deviceId: 'test-device-id',
        subscription: {
          endpoint: 'https://fcm.googleapis.com/test',
          keys: {
            p256dh: 'test-p256dh',
            auth: 'test-auth',
          },
        },
      };

      const error = new Error('Device not found');
      mockPushService.create.mockRejectedValue(error);

      await expect(controller.subscribe(subscriptionDto)).rejects.toThrow('Device not found');
    });
  });

  describe('scheduleNotification', () => {
    it('should schedule a notification for a program', async () => {
      const scheduleDto = {
        programId: '1',
        title: 'Test Program',
        minutesBefore: 10,
      };

      mockPushService.scheduleForProgram.mockResolvedValue(undefined);

      const result = await controller.scheduleNotification(scheduleDto);

      expect(mockPushService.scheduleForProgram).toHaveBeenCalledWith(
        scheduleDto.programId,
        scheduleDto.title,
        scheduleDto.minutesBefore
      );
      expect(result).toBeUndefined();
    });

    it('should handle scheduling errors', async () => {
      const scheduleDto = {
        programId: '1',
        title: 'Test Program',
        minutesBefore: 10,
      };

      const error = new Error('Scheduling failed');
      mockPushService.scheduleForProgram.mockRejectedValue(error);

      await expect(controller.scheduleNotification(scheduleDto)).rejects.toThrow('Scheduling failed');
    });
  });
}); 