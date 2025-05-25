import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubscriptionService } from './subscription.service';
import { UserSubscription, NotificationMethod } from './user-subscription.entity';
import { Program } from '../programs/programs.entity';
import { User } from './users.entity';
import { Channel } from '../channels/channels.entity';
import { NotFoundException, ConflictException } from '@nestjs/common';

describe('SubscriptionService', () => {
  let service: SubscriptionService;
  let userSubscriptionRepository: Repository<UserSubscription>;
  let programRepository: Repository<Program>;

  const mockUser: User = {
    id: 1,
    email: 'test@example.com',
    password: 'hashedPassword',
    phone: '1234567890',
    firstName: 'John',
    lastName: 'Doe',
    role: 'user',
    createdAt: new Date(),
    devices: [],
    subscriptions: [],
  };

  const mockChannel: Channel = {
    id: 1,
    name: 'Test Channel',
    description: 'Test Description',
    logo_url: 'test-logo.png',
    handle: 'test',
    youtube_channel_id: 'test-channel-id',
    order: 1,
    programs: [],
  };

  const mockProgram: Program = {
    id: 1,
    name: 'Test Program',
    description: 'Test Description',
    logo_url: 'test-logo.png',
    youtube_url: 'https://youtube.com/test',
    stream_url: '',
    is_live: false,
    channel: mockChannel,
    panelists: [],
    schedules: [],
  };

  const mockSubscription: UserSubscription = {
    id: 'sub-1',
    user: mockUser,
    program: mockProgram,
    notificationMethod: NotificationMethod.PUSH,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockUserSubscriptionRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    update: jest.fn(),
  };

  const mockProgramRepository = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionService,
        {
          provide: getRepositoryToken(UserSubscription),
          useValue: mockUserSubscriptionRepository,
        },
        {
          provide: getRepositoryToken(Program),
          useValue: mockProgramRepository,
        },
      ],
    }).compile();

    service = module.get<SubscriptionService>(SubscriptionService);
    userSubscriptionRepository = module.get<Repository<UserSubscription>>(
      getRepositoryToken(UserSubscription)
    );
    programRepository = module.get<Repository<Program>>(getRepositoryToken(Program));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createSubscription', () => {
    it('should create a new subscription', async () => {
      const createDto = {
        programId: 1,
        notificationMethod: NotificationMethod.PUSH,
      };

      mockProgramRepository.findOne.mockResolvedValue(mockProgram);
      mockUserSubscriptionRepository.findOne.mockResolvedValue(null);
      mockUserSubscriptionRepository.create.mockReturnValue(mockSubscription);
      mockUserSubscriptionRepository.save.mockResolvedValue(mockSubscription);

      const result = await service.createSubscription(mockUser, createDto);

      expect(mockProgramRepository.findOne).toHaveBeenCalledWith({
        where: { id: createDto.programId },
      });
      expect(mockUserSubscriptionRepository.findOne).toHaveBeenCalledWith({
        where: { user: { id: mockUser.id }, program: { id: createDto.programId } },
      });
      expect(mockUserSubscriptionRepository.create).toHaveBeenCalledWith({
        user: mockUser,
        program: mockProgram,
        notificationMethod: createDto.notificationMethod,
        isActive: true,
      });
      expect(result).toEqual(mockSubscription);
    });

    it('should throw NotFoundException when program not found', async () => {
      const createDto = {
        programId: 999,
        notificationMethod: NotificationMethod.PUSH,
      };

      mockProgramRepository.findOne.mockResolvedValue(null);

      await expect(service.createSubscription(mockUser, createDto))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when subscription already exists', async () => {
      const createDto = {
        programId: 1,
        notificationMethod: NotificationMethod.PUSH,
      };

      mockProgramRepository.findOne.mockResolvedValue(mockProgram);
      mockUserSubscriptionRepository.findOne.mockResolvedValue(mockSubscription);

      await expect(service.createSubscription(mockUser, createDto))
        .rejects.toThrow(ConflictException);
    });

    it('should create subscription with EMAIL notification method', async () => {
      const createDto = {
        programId: 1,
        notificationMethod: NotificationMethod.EMAIL,
      };

      const emailSubscription = {
        ...mockSubscription,
        notificationMethod: NotificationMethod.EMAIL,
      };

      mockProgramRepository.findOne.mockResolvedValue(mockProgram);
      mockUserSubscriptionRepository.findOne.mockResolvedValue(null);
      mockUserSubscriptionRepository.create.mockReturnValue(emailSubscription);
      mockUserSubscriptionRepository.save.mockResolvedValue(emailSubscription);

      const result = await service.createSubscription(mockUser, createDto);

      expect(result.notificationMethod).toBe(NotificationMethod.EMAIL);
    });

    it('should create subscription with BOTH notification method', async () => {
      const createDto = {
        programId: 1,
        notificationMethod: NotificationMethod.BOTH,
      };

      const bothSubscription = {
        ...mockSubscription,
        notificationMethod: NotificationMethod.BOTH,
      };

      mockProgramRepository.findOne.mockResolvedValue(mockProgram);
      mockUserSubscriptionRepository.findOne.mockResolvedValue(null);
      mockUserSubscriptionRepository.create.mockReturnValue(bothSubscription);
      mockUserSubscriptionRepository.save.mockResolvedValue(bothSubscription);

      const result = await service.createSubscription(mockUser, createDto);

      expect(result.notificationMethod).toBe(NotificationMethod.BOTH);
    });
  });

  describe('getUserSubscriptions', () => {
    it('should return user subscriptions', async () => {
      const subscriptions = [mockSubscription];
      mockUserSubscriptionRepository.find.mockResolvedValue(subscriptions);

      const result = await service.getUserSubscriptions(mockUser.id);

      expect(mockUserSubscriptionRepository.find).toHaveBeenCalledWith({
        where: { user: { id: mockUser.id }, isActive: true },
        relations: ['program', 'program.channel'],
        order: { createdAt: 'DESC' },
      });
      expect(result).toEqual(subscriptions);
    });

    it('should return empty array when no subscriptions', async () => {
      mockUserSubscriptionRepository.find.mockResolvedValue([]);

      const result = await service.getUserSubscriptions(mockUser.id);

      expect(result).toEqual([]);
    });
  });

  describe('removeSubscription', () => {
    it('should remove a subscription', async () => {
      mockUserSubscriptionRepository.findOne.mockResolvedValue(mockSubscription);
      mockUserSubscriptionRepository.remove.mockResolvedValue(mockSubscription);

      await service.removeSubscription(mockUser.id, mockSubscription.id);

      expect(mockUserSubscriptionRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockSubscription.id, user: { id: mockUser.id } },
      });
      expect(mockUserSubscriptionRepository.remove).toHaveBeenCalledWith(mockSubscription);
    });

    it('should throw NotFoundException when subscription not found', async () => {
      mockUserSubscriptionRepository.findOne.mockResolvedValue(null);

      await expect(service.removeSubscription(mockUser.id, 'non-existent'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('updateSubscription', () => {
    it('should update subscription notification method', async () => {
      const updateDto = {
        notificationMethod: NotificationMethod.EMAIL,
      };

      const updatedSubscription = {
        ...mockSubscription,
        notificationMethod: NotificationMethod.EMAIL,
      };

      mockUserSubscriptionRepository.findOne.mockResolvedValue(mockSubscription);
      mockUserSubscriptionRepository.save.mockResolvedValue(updatedSubscription);

      const result = await service.updateSubscription(mockUser.id, mockSubscription.id, updateDto);

      expect(mockUserSubscriptionRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockSubscription.id, user: { id: mockUser.id } },
        relations: ['program'],
      });
      expect(result.notificationMethod).toBe(NotificationMethod.EMAIL);
    });

    it('should throw NotFoundException when subscription not found', async () => {
      const updateDto = {
        notificationMethod: NotificationMethod.EMAIL,
      };

      mockUserSubscriptionRepository.findOne.mockResolvedValue(null);

      await expect(service.updateSubscription(mockUser.id, 'non-existent', updateDto))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('isUserSubscribedToProgram', () => {
    it('should return true when user is subscribed', async () => {
      mockUserSubscriptionRepository.findOne.mockResolvedValue(mockSubscription);

      const result = await service.isUserSubscribedToProgram(mockUser.id, mockProgram.id);

      expect(mockUserSubscriptionRepository.findOne).toHaveBeenCalledWith({
        where: { user: { id: mockUser.id }, program: { id: mockProgram.id }, isActive: true },
      });
      expect(result).toBe(true);
    });

    it('should return false when user is not subscribed', async () => {
      mockUserSubscriptionRepository.findOne.mockResolvedValue(null);

      const result = await service.isUserSubscribedToProgram(mockUser.id, mockProgram.id);

      expect(result).toBe(false);
    });
  });
}); 