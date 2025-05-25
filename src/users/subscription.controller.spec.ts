import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { DeviceService } from './device.service';
import { UsersService } from './users.service';
import { NotificationMethod } from './user-subscription.entity';
import { NotFoundException } from '@nestjs/common';

describe('SubscriptionController', () => {
  let controller: SubscriptionController;
  let subscriptionService: SubscriptionService;

  const mockUser = {
    id: 1,
    email: 'test@example.com',
    role: 'user',
  };

  const mockSubscription = {
    id: 'sub-1',
    user: mockUser,
    program: {
      id: 1,
      name: 'Test Program',
      channel: { id: 1, name: 'Test Channel' },
    },
    notificationMethod: NotificationMethod.PUSH,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSubscriptionService = {
    getUserSubscriptions: jest.fn(),
    createSubscription: jest.fn(),
    updateSubscription: jest.fn(),
    removeSubscription: jest.fn(),
  };

  const mockDeviceService = {
    findOrCreateDevice: jest.fn(),
    getUserDevices: jest.fn(),
  };

  const mockUsersService = {
    findOne: jest.fn(),
    create: jest.fn(),
    ensureUserDevice: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionController],
      providers: [
        {
          provide: SubscriptionService,
          useValue: mockSubscriptionService,
        },
        {
          provide: DeviceService,
          useValue: mockDeviceService,
        },
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
      ],
    }).compile();

    controller = module.get<SubscriptionController>(SubscriptionController);
    subscriptionService = module.get<SubscriptionService>(SubscriptionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserSubscriptions', () => {
    it('should return user subscriptions for real users', async () => {
      const subscriptions = [mockSubscription];
      mockSubscriptionService.getUserSubscriptions.mockResolvedValue(subscriptions);

      const mockRequest = { user: mockUser };
      const result = await controller.getUserSubscriptions(mockRequest);

      expect(mockSubscriptionService.getUserSubscriptions).toHaveBeenCalledWith(mockUser.id);
      expect(result.subscriptions).toBeDefined();
    });

    it('should return empty array for legacy users', async () => {
      const legacyUser = { id: 'public', type: 'public', email: 'legacy@example.com', role: 'user' };
      const mockRequest = { user: legacyUser };

      const result = await controller.getUserSubscriptions(mockRequest);

      expect(mockSubscriptionService.getUserSubscriptions).not.toHaveBeenCalled();
      expect(result.subscriptions).toEqual([]);
    });
  });

  describe('createSubscription', () => {
    it('should create a subscription for real users', async () => {
      const createDto = {
        programId: 1,
        notificationMethod: NotificationMethod.PUSH,
      };

      mockUsersService.findOne.mockResolvedValue(mockUser);
      mockSubscriptionService.createSubscription.mockResolvedValue(mockSubscription);

      const mockRequest = { user: mockUser };
      const result = await controller.createSubscription(mockRequest, createDto);

      expect(mockUsersService.findOne).toHaveBeenCalledWith(mockUser.id);
      expect(mockSubscriptionService.createSubscription).toHaveBeenCalledWith(mockUser, createDto);
      expect(result.message).toBe('Successfully subscribed to program');
    });

    it('should return error for legacy users', async () => {
      const legacyUser = { id: 'public', type: 'public', email: 'legacy@example.com', role: 'user' };
      const createDto = {
        programId: 1,
        notificationMethod: NotificationMethod.PUSH,
      };

      const mockRequest = { user: legacyUser };
      const result = await controller.createSubscription(mockRequest, createDto);

      expect(result.error).toBe('Subscriptions not available for legacy authentication');
    });
  });

  describe('updateSubscription', () => {
    it('should update a subscription for real users', async () => {
      const updateDto = {
        notificationMethod: NotificationMethod.EMAIL,
      };

      const updatedSubscription = {
        ...mockSubscription,
        notificationMethod: NotificationMethod.EMAIL,
      };

      mockSubscriptionService.updateSubscription.mockResolvedValue(updatedSubscription);

      const mockRequest = { user: mockUser };
      const result = await controller.updateSubscription(mockRequest, 'sub-1', updateDto);

      expect(mockSubscriptionService.updateSubscription).toHaveBeenCalledWith(
        mockUser.id,
        'sub-1',
        updateDto
      );
      expect(result.message).toBe('Subscription updated successfully');
    });

    it('should return error for legacy users', async () => {
      const legacyUser = { id: 'public', type: 'public', email: 'legacy@example.com', role: 'user' };
      const updateDto = {
        notificationMethod: NotificationMethod.EMAIL,
      };

      const mockRequest = { user: legacyUser };
      const result = await controller.updateSubscription(mockRequest, 'sub-1', updateDto);

      expect(result.error).toBe('Subscriptions not available for legacy authentication');
    });
  });

  describe('removeSubscription', () => {
    it('should remove a subscription for real users', async () => {
      mockSubscriptionService.removeSubscription.mockResolvedValue(undefined);

      const mockRequest = { user: mockUser };
      const result = await controller.removeSubscription(mockRequest, 'sub-1');

      expect(mockSubscriptionService.removeSubscription).toHaveBeenCalledWith(
        mockUser.id,
        'sub-1'
      );
      expect(result.message).toBe('Successfully unsubscribed from program');
    });

    it('should return error for legacy users', async () => {
      const legacyUser = { id: 'public', type: 'public', email: 'legacy@example.com', role: 'user' };
      const mockRequest = { user: legacyUser };

      const result = await controller.removeSubscription(mockRequest, 'sub-1');

      expect(result.error).toBe('Subscriptions not available for legacy authentication');
    });
  });
}); 