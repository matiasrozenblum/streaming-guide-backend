import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PushService } from './push.service';
import { PushSubscriptionEntity } from './push-subscription.entity';
import { Device } from '../users/device.entity';
import { NotificationsService } from '../notifications/notifications.service';
import * as webpush from 'web-push';

// Mock web-push
jest.mock('web-push');
const mockWebPush = webpush as jest.Mocked<typeof webpush>;

describe('PushService', () => {
  let service: PushService;
  let pushSubscriptionRepository: Repository<PushSubscriptionEntity>;
  let deviceRepository: Repository<Device>;

  const mockDevice: Partial<Device> = {
    id: 'device-uuid',
    deviceId: 'test-device-id',
    deviceName: 'Chrome Browser',
    deviceType: 'web',
    userAgent: 'Mozilla/5.0 Chrome/91.0',
    lastSeen: new Date(),
    pushSubscriptions: [],
  };

  const mockPushSubscription: PushSubscriptionEntity = {
    id: 'push-sub-uuid',
    device: mockDevice as Device,
    endpoint: 'https://fcm.googleapis.com/test',
    p256dh: 'test-p256dh',
    auth: 'test-auth',
    createdAt: new Date(),
  };

  const mockPushSubscriptionRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockDeviceRepository = {
    findOne: jest.fn(),
  };

  const mockNotificationsService = {
    list: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushService,
        {
          provide: getRepositoryToken(PushSubscriptionEntity),
          useValue: mockPushSubscriptionRepository,
        },
        {
          provide: getRepositoryToken(Device),
          useValue: mockDeviceRepository,
        },
        {
          provide: NotificationsService,
          useValue: mockNotificationsService,
        },
      ],
    }).compile();

    service = module.get<PushService>(PushService);
    pushSubscriptionRepository = module.get<Repository<PushSubscriptionEntity>>(
      getRepositoryToken(PushSubscriptionEntity)
    );
    deviceRepository = module.get<Repository<Device>>(getRepositoryToken(Device));

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new push subscription', async () => {
      const createDto = {
        deviceId: 'test-device-id',
        subscription: {
          endpoint: 'https://fcm.googleapis.com/test',
          keys: {
            p256dh: 'test-p256dh',
            auth: 'test-auth',
          },
        },
      };

      mockDeviceRepository.findOne.mockResolvedValue(mockDevice);
      mockPushSubscriptionRepository.findOne.mockResolvedValue(null);
      mockPushSubscriptionRepository.create.mockReturnValue(mockPushSubscription);
      mockPushSubscriptionRepository.save.mockResolvedValue(mockPushSubscription);

      const result = await service.create(createDto);

      expect(mockDeviceRepository.findOne).toHaveBeenCalledWith({
        where: { deviceId: 'test-device-id' },
      });
      expect(mockPushSubscriptionRepository.create).toHaveBeenCalledWith({
        device: mockDevice,
        endpoint: createDto.subscription.endpoint,
        p256dh: createDto.subscription.keys.p256dh,
        auth: createDto.subscription.keys.auth,
      });
      expect(result).toEqual(mockPushSubscription);
    });

    it('should return existing subscription if it already exists', async () => {
      const createDto = {
        deviceId: 'test-device-id',
        subscription: {
          endpoint: 'https://fcm.googleapis.com/test',
          keys: {
            p256dh: 'test-p256dh',
            auth: 'test-auth',
          },
        },
      };

      mockDeviceRepository.findOne.mockResolvedValue(mockDevice);
      mockPushSubscriptionRepository.findOne.mockResolvedValue(mockPushSubscription);

      const result = await service.create(createDto);

      expect(result).toEqual(mockPushSubscription);
      expect(mockPushSubscriptionRepository.create).not.toHaveBeenCalled();
    });

    it('should throw error when device not found', async () => {
      const createDto = {
        deviceId: 'non-existent-device',
        subscription: {
          endpoint: 'https://fcm.googleapis.com/test',
          keys: {
            p256dh: 'test-p256dh',
            auth: 'test-auth',
          },
        },
      };

      mockDeviceRepository.findOne.mockResolvedValue(null);

      await expect(service.create(createDto)).rejects.toThrow('Device not found');
    });
  });

  describe('sendNotification', () => {
    const mockPayload = {
      title: 'Test Notification',
      options: {
        body: 'Test notification body',
        icon: '/img/logo-192x192.png',
      },
    };

    it('should send notification successfully', async () => {
      mockWebPush.sendNotification.mockResolvedValue({} as any);

      await service.sendNotification(mockPushSubscription, mockPayload);

      expect(mockWebPush.sendNotification).toHaveBeenCalledWith(
        {
          endpoint: mockPushSubscription.endpoint,
          keys: {
            p256dh: mockPushSubscription.p256dh,
            auth: mockPushSubscription.auth,
          },
        },
        JSON.stringify(mockPayload)
      );
    });

    it('should handle notification sending errors', async () => {
      const error = new Error('Push service error');
      mockWebPush.sendNotification.mockRejectedValue(error);

      await expect(service.sendNotification(mockPushSubscription, mockPayload))
        .rejects.toThrow('Push service error');
    });
  });

  describe('scheduleForProgram', () => {
    it('should log scheduling request', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await service.scheduleForProgram('1', 'Test Program', 10);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('scheduleForProgram(1, "Test Program", 10m)')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('sendNotificationToDevices', () => {
    it('should send notifications to all devices with push subscriptions', async () => {
      const devicesWithSubscriptions = [
        {
          ...mockDevice,
          pushSubscriptions: [mockPushSubscription],
        },
      ] as Device[];

      const mockPayload = { title: 'Test', options: { body: 'Test body' } };
      mockWebPush.sendNotification.mockResolvedValue({} as any);

      await service.sendNotificationToDevices(devicesWithSubscriptions, mockPayload);

      expect(mockWebPush.sendNotification).toHaveBeenCalledTimes(1);
    });

    it('should handle errors when sending to individual devices', async () => {
      const devicesWithSubscriptions = [
        {
          ...mockDevice,
          pushSubscriptions: [mockPushSubscription],
        },
      ] as Device[];

      const mockPayload = { title: 'Test', options: { body: 'Test body' } };
      const error = new Error('Push failed');
      mockWebPush.sendNotification.mockRejectedValue(error);

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await service.sendNotificationToDevices(devicesWithSubscriptions, mockPayload);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send push notification'),
        error
      );

      consoleSpy.mockRestore();
    });
  });
}); 