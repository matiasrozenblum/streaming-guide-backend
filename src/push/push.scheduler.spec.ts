import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Logger } from '@nestjs/common';
import { PushScheduler } from './push.scheduler';
import { PushService } from './push.service';
import { EmailService } from '../email/email.service';
import { Schedule } from '../schedules/schedules.entity';
import { UserSubscription, NotificationMethod } from '../users/user-subscription.entity';
import { PushSubscriptionEntity } from './push-subscription.entity';
import * as dayjs from 'dayjs';
import { ConfigService } from '../config/config.service';

// Mock dayjs
jest.mock('dayjs', () => {
  const originalDayjs = jest.requireActual('dayjs');
  
  const mockDayjs = jest.fn((date?: any) => {
    if (date) return originalDayjs(date);
    // Return a fixed date for consistent testing - Friday 10:00 AM
    return originalDayjs('2023-12-01T10:00:00.000Z');
  }) as any;
  
  // Mock the tz method to return an object with add, second, millisecond, and format methods
  mockDayjs.tz = jest.fn(() => ({
    add: jest.fn(() => ({
      second: jest.fn(() => ({
        millisecond: jest.fn(() => ({
          format: jest.fn(() => 'friday'),
          isBefore: jest.fn(() => false),
        })),
      })),
    })),
    format: jest.fn(() => '10:10:00'),
  }));
  
  // Copy all static methods and properties
  Object.setPrototypeOf(mockDayjs, originalDayjs);
  Object.assign(mockDayjs, originalDayjs);
  
  return mockDayjs;
});

describe('PushScheduler', () => {
  let scheduler: PushScheduler;
  let pushService: PushService;
  let emailService: EmailService;
  let scheduleRepository: Repository<Schedule>;
  let userSubscriptionRepository: Repository<UserSubscription>;
  let pushSubscriptionRepository: Repository<PushSubscriptionEntity>;

  const mockChannel = {
    id: 1,
    name: 'Test Channel',
    logo_url: 'https://example.com/channel-logo.png',
    is_visible: true,
  };

  const mockProgram = {
    id: 1,
    name: 'Test Program',
    description: 'Test program description',
    logo_url: 'https://example.com/program-logo.png',
    channel: mockChannel,
  };

  const mockSchedule = {
    id: 1,
    day_of_week: 'friday',
    start_time: '10:10:00',
    end_time: '11:00:00',
    program: mockProgram,
  };

  const mockUser = {
    id: 1,
    email: 'test@example.com',
    devices: [
      {
        id: 1,
        deviceId: 'device-1',
        pushSubscriptions: [
          {
            id: 1,
            endpoint: 'https://fcm.googleapis.com/test',
            p256dh: 'test-p256dh',
            auth: 'test-auth',
          },
        ],
      },
    ],
  };

  const mockUserSubscription = {
    id: 'sub-1',
    user: mockUser,
    program: mockProgram,
    notificationMethod: NotificationMethod.PUSH,
    isActive: true,
  };

  const mockPushService = {
    sendNotification: jest.fn(),
  };

  const mockEmailService = {
    mailerService: {
      sendMail: jest.fn(),
    },
  };

  const mockScheduleRepository = {
    find: jest.fn(),
  };

  const mockUserSubscriptionRepository = {
    find: jest.fn(),
  };

  const mockPushSubscriptionRepository = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushScheduler,
        {
          provide: PushService,
          useValue: mockPushService,
        },
        {
          provide: EmailService,
          useValue: mockEmailService,
        },
        {
          provide: getRepositoryToken(Schedule),
          useValue: mockScheduleRepository,
        },
        {
          provide: getRepositoryToken(UserSubscription),
          useValue: mockUserSubscriptionRepository,
        },
        {
          provide: getRepositoryToken(PushSubscriptionEntity),
          useValue: mockPushSubscriptionRepository,
        },
        {
          provide: ConfigService,
          useValue: {
            canFetchLive: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();

    scheduler = module.get<PushScheduler>(PushScheduler);
    pushService = module.get<PushService>(PushService);
    emailService = module.get<EmailService>(EmailService);
    scheduleRepository = module.get<Repository<Schedule>>(getRepositoryToken(Schedule));
    userSubscriptionRepository = module.get<Repository<UserSubscription>>(
      getRepositoryToken(UserSubscription)
    );
    pushSubscriptionRepository = module.get<Repository<PushSubscriptionEntity>>(
      getRepositoryToken(PushSubscriptionEntity)
    );

    // Mock logger methods
    jest.spyOn(scheduler['logger'], 'log').mockImplementation();
    jest.spyOn(scheduler['logger'], 'debug').mockImplementation();
    jest.spyOn(scheduler['logger'], 'error').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleNotificationsCron', () => {
    it('should send push notifications for due schedules', async () => {
      mockScheduleRepository.find.mockResolvedValue([mockSchedule]);
      mockUserSubscriptionRepository.find.mockResolvedValue([mockUserSubscription]);
      mockPushService.sendNotification.mockResolvedValue(undefined);

      await scheduler.handleNotificationsCron();

      expect(mockScheduleRepository.find).toHaveBeenCalledWith({
        where: { day_of_week: 'friday', start_time: '07:10:00' },
        relations: ['program', 'program.channel'],
      });

      expect(mockUserSubscriptionRepository.find).toHaveBeenCalledWith({
        where: { 
          program: { id: In([mockProgram.id]) },
          isActive: true,
        },
        relations: ['user', 'user.devices', 'user.devices.pushSubscriptions', 'program', 'program.channel'],
      });

      expect(mockPushService.sendNotification).toHaveBeenCalledWith(
        mockUser.devices[0].pushSubscriptions[0],
        {
          title: mockProgram.name,
          options: {
            body: `¡En 10 minutos comienza ${mockProgram.name}!`,
            icon: '/img/logo-192x192.png',
          },
        }
      );
    });

    it('should send email notifications for due schedules', async () => {
      const emailSubscription = {
        ...mockUserSubscription,
        notificationMethod: NotificationMethod.EMAIL,
      };

      mockScheduleRepository.find.mockResolvedValue([mockSchedule]);
      mockUserSubscriptionRepository.find.mockResolvedValue([emailSubscription]);
      mockEmailService.mailerService.sendMail.mockResolvedValue(undefined);

      await scheduler.handleNotificationsCron();

      expect(mockEmailService.mailerService.sendMail).toHaveBeenCalledWith({
        to: mockUser.email,
        subject: `¡${mockProgram.name} comienza en 10 minutos!`,
        html: expect.stringContaining(mockProgram.name),
      });
    });

    it('should send both push and email notifications when method is BOTH', async () => {
      const bothSubscription = {
        ...mockUserSubscription,
        notificationMethod: NotificationMethod.BOTH,
      };

      mockScheduleRepository.find.mockResolvedValue([mockSchedule]);
      mockUserSubscriptionRepository.find.mockResolvedValue([bothSubscription]);
      mockPushService.sendNotification.mockResolvedValue(undefined);
      mockEmailService.mailerService.sendMail.mockResolvedValue(undefined);

      await scheduler.handleNotificationsCron();

      expect(mockPushService.sendNotification).toHaveBeenCalled();
      expect(mockEmailService.mailerService.sendMail).toHaveBeenCalled();
    });

    it('should handle multiple schedules for different programs', async () => {
      const program2 = { ...mockProgram, id: 2, name: 'Program 2' };
      const schedule2 = { ...mockSchedule, id: 2, program: program2 };
      const subscription2 = { ...mockUserSubscription, id: 'sub-2', program: program2 };

      mockScheduleRepository.find.mockResolvedValue([mockSchedule, schedule2]);
      mockUserSubscriptionRepository.find.mockResolvedValue([mockUserSubscription, subscription2]);
      mockPushService.sendNotification.mockResolvedValue(undefined);

      await scheduler.handleNotificationsCron();

      expect(mockPushService.sendNotification).toHaveBeenCalledTimes(2);
      expect(mockPushService.sendNotification).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          title: mockProgram.name,
        })
      );
      expect(mockPushService.sendNotification).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          title: program2.name,
        })
      );
    });

    it('should handle users with multiple devices', async () => {
      const userWithMultipleDevices = {
        ...mockUser,
        devices: [
          mockUser.devices[0],
          {
            id: 2,
            deviceId: 'device-2',
            pushSubscriptions: [
              {
                id: 2,
                endpoint: 'https://fcm.googleapis.com/test2',
                p256dh: 'test-p256dh-2',
                auth: 'test-auth-2',
              },
            ],
          },
        ],
      };

      const subscriptionWithMultipleDevices = {
        ...mockUserSubscription,
        user: userWithMultipleDevices,
      };

      mockScheduleRepository.find.mockResolvedValue([mockSchedule]);
      mockUserSubscriptionRepository.find.mockResolvedValue([subscriptionWithMultipleDevices]);
      mockPushService.sendNotification.mockResolvedValue(undefined);

      await scheduler.handleNotificationsCron();

      expect(mockPushService.sendNotification).toHaveBeenCalledTimes(2);
    });

    it('should handle devices with multiple push subscriptions', async () => {
      const deviceWithMultipleSubscriptions = {
        ...mockUser.devices[0],
        pushSubscriptions: [
          mockUser.devices[0].pushSubscriptions[0],
          {
            id: 2,
            endpoint: 'https://fcm.googleapis.com/test2',
            p256dh: 'test-p256dh-2',
            auth: 'test-auth-2',
          },
        ],
      };

      const userWithMultipleSubscriptions = {
        ...mockUser,
        devices: [deviceWithMultipleSubscriptions],
      };

      const subscription = {
        ...mockUserSubscription,
        user: userWithMultipleSubscriptions,
      };

      mockScheduleRepository.find.mockResolvedValue([mockSchedule]);
      mockUserSubscriptionRepository.find.mockResolvedValue([subscription]);
      mockPushService.sendNotification.mockResolvedValue(undefined);

      await scheduler.handleNotificationsCron();

      expect(mockPushService.sendNotification).toHaveBeenCalledTimes(2);
    });

    it('should skip users without devices', async () => {
      const userWithoutDevices = {
        ...mockUser,
        devices: [],
      };

      const subscriptionWithoutDevices = {
        ...mockUserSubscription,
        user: userWithoutDevices,
      };

      mockScheduleRepository.find.mockResolvedValue([mockSchedule]);
      mockUserSubscriptionRepository.find.mockResolvedValue([subscriptionWithoutDevices]);

      await scheduler.handleNotificationsCron();

      expect(mockPushService.sendNotification).not.toHaveBeenCalled();
    });

    it('should skip devices without push subscriptions', async () => {
      const deviceWithoutSubscriptions = {
        ...mockUser.devices[0],
        pushSubscriptions: [],
      };

      const userWithDeviceWithoutSubscriptions = {
        ...mockUser,
        devices: [deviceWithoutSubscriptions],
      };

      const subscription = {
        ...mockUserSubscription,
        user: userWithDeviceWithoutSubscriptions,
      };

      mockScheduleRepository.find.mockResolvedValue([mockSchedule]);
      mockUserSubscriptionRepository.find.mockResolvedValue([subscription]);

      await scheduler.handleNotificationsCron();

      expect(mockPushService.sendNotification).not.toHaveBeenCalled();
    });

    it('should handle push notification failures gracefully', async () => {
      mockScheduleRepository.find.mockResolvedValue([mockSchedule]);
      mockUserSubscriptionRepository.find.mockResolvedValue([mockUserSubscription]);
      mockPushService.sendNotification.mockRejectedValue(new Error('Push failed'));

      await scheduler.handleNotificationsCron();

      expect(scheduler['logger'].error).toHaveBeenCalledWith(
        expect.stringContaining('❌ Falló push notification'),
        expect.any(Error)
      );
    });

    it('should handle email notification failures gracefully', async () => {
      const emailSubscription = {
        ...mockUserSubscription,
        notificationMethod: NotificationMethod.EMAIL,
      };

      mockScheduleRepository.find.mockResolvedValue([mockSchedule]);
      mockUserSubscriptionRepository.find.mockResolvedValue([emailSubscription]);
      mockEmailService.mailerService.sendMail.mockRejectedValue(new Error('Email failed'));

      await scheduler.handleNotificationsCron();

      expect(scheduler['logger'].error).toHaveBeenCalledWith(
        expect.stringContaining('❌ Falló email notification'),
        expect.any(Error)
      );
    });

    it('should return early when no schedules match', async () => {
      mockScheduleRepository.find.mockResolvedValue([]);

      await scheduler.handleNotificationsCron();

      expect(scheduler['logger'].debug).toHaveBeenCalledWith('Ningún programa coincide.');
      expect(mockUserSubscriptionRepository.find).not.toHaveBeenCalled();
    });

    it('should return early when no subscriptions exist', async () => {
      mockScheduleRepository.find.mockResolvedValue([mockSchedule]);
      mockUserSubscriptionRepository.find.mockResolvedValue([]);

      await scheduler.handleNotificationsCron();

      expect(scheduler['logger'].debug).toHaveBeenCalledWith(
        'No hay subscripciones activas para estos programas.'
      );
      expect(mockPushService.sendNotification).not.toHaveBeenCalled();
    });

    it('should handle programs without channels', async () => {
      const programWithoutChannel = {
        ...mockProgram,
        channel: null,
      };

      const scheduleWithoutChannel = {
        ...mockSchedule,
        program: programWithoutChannel,
      };

      const subscriptionWithoutChannel = {
        ...mockUserSubscription,
        program: programWithoutChannel,
      };

      mockScheduleRepository.find.mockResolvedValue([scheduleWithoutChannel]);
      mockUserSubscriptionRepository.find.mockResolvedValue([subscriptionWithoutChannel]);
      mockPushService.sendNotification.mockResolvedValue(undefined);

      await scheduler.handleNotificationsCron();

      expect(mockPushService.sendNotification).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          title: programWithoutChannel.name,
        })
      );
    });

    it('should log successful notifications', async () => {
      mockScheduleRepository.find.mockResolvedValue([mockSchedule]);
      mockUserSubscriptionRepository.find.mockResolvedValue([mockUserSubscription]);
      mockPushService.sendNotification.mockResolvedValue(undefined);

      await scheduler.handleNotificationsCron();

      expect(scheduler['logger'].log).toHaveBeenCalledWith(
        expect.stringContaining('✅ Push notification enviada')
      );
    });

    it('should log successful email notifications', async () => {
      const emailSubscription = {
        ...mockUserSubscription,
        notificationMethod: NotificationMethod.EMAIL,
      };

      mockScheduleRepository.find.mockResolvedValue([mockSchedule]);
      mockUserSubscriptionRepository.find.mockResolvedValue([emailSubscription]);
      mockEmailService.mailerService.sendMail.mockResolvedValue(undefined);

      await scheduler.handleNotificationsCron();

      expect(scheduler['logger'].log).toHaveBeenCalledWith(
        expect.stringContaining('✅ Email notification enviado')
      );
    });

    it('should handle null/undefined devices gracefully', async () => {
      const userWithNullDevices = {
        ...mockUser,
        devices: null,
      };

      const subscriptionWithNullDevices = {
        ...mockUserSubscription,
        user: userWithNullDevices,
      };

      mockScheduleRepository.find.mockResolvedValue([mockSchedule]);
      mockUserSubscriptionRepository.find.mockResolvedValue([subscriptionWithNullDevices]);

      await scheduler.handleNotificationsCron();

      expect(mockPushService.sendNotification).not.toHaveBeenCalled();
    });

    it('should handle null/undefined push subscriptions gracefully', async () => {
      const deviceWithNullSubscriptions = {
        ...mockUser.devices[0],
        pushSubscriptions: null,
      };

      const userWithNullSubscriptions = {
        ...mockUser,
        devices: [deviceWithNullSubscriptions],
      };

      const subscription = {
        ...mockUserSubscription,
        user: userWithNullSubscriptions,
      };

      mockScheduleRepository.find.mockResolvedValue([mockSchedule]);
      mockUserSubscriptionRepository.find.mockResolvedValue([subscription]);

      await scheduler.handleNotificationsCron();

      expect(mockPushService.sendNotification).not.toHaveBeenCalled();
    });
  });
}); 