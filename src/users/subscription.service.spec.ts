import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubscriptionService } from './subscription.service';
import { UserSubscription } from './user-subscription.entity';
import { Program } from '../programs/programs.entity';
import { User } from './users.entity';
import { Channel } from '../channels/channels.entity';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { Device } from './device.entity';
import { PushSubscriptionEntity } from '../push/push-subscription.entity';

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
    gender: 'male' as const,
    birthDate: new Date('1990-01-01'),
    createdAt: new Date(),
    origin: 'traditional',
    devices: [],
    subscriptions: [],
    streamerSubscriptions: [],
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
    is_visible: true,
    background_color: null,
    show_only_when_scheduled: false,
    categories: [],
  };

  const mockProgram: Program = {
    id: 1,
    name: 'Test Program',
    description: 'Test Description',
    logo_url: 'test-logo.png',
    youtube_url: 'https://youtube.com/test',
    stream_url: '',
    is_live: false,
    is_visible: true,
    channel: mockChannel,
    panelists: [],
    schedules: [],
    style_override: null,
  };

  const mockSubscription: UserSubscription = {
    id: 'sub-1',
    user: mockUser,
    program: mockProgram,

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
    delete: jest.fn(),
  };

  const mockProgramRepository = {
    findOne: jest.fn(),
  };

  const mockUserRepository = {
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
        {
          provide: getRepositoryToken(Device),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(PushSubscriptionEntity),
          useValue: {},
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
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
        endpoint: 'test-endpoint',
        p256dh: 'test-p256dh',
        auth: 'test-auth',
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
        isActive: true,
      });
      expect(result).toEqual(mockSubscription);
    });

    it('should throw NotFoundException when program not found', async () => {
      const createDto = {
        programId: 999,
        endpoint: 'test-endpoint',
        p256dh: 'test-p256dh',
        auth: 'test-auth',
      };

      mockProgramRepository.findOne.mockResolvedValue(null);

      await expect(service.createSubscription(mockUser, createDto))
        .rejects.toThrow(NotFoundException);
    });

    it('should update and return the existing subscription when subscription already exists', async () => {
      const createDto = {
        programId: 1,
        endpoint: 'test-endpoint',
        p256dh: 'test-p256dh',
        auth: 'test-auth',
      };

      mockProgramRepository.findOne.mockResolvedValue(mockProgram);
      mockUserSubscriptionRepository.findOne.mockResolvedValue(mockSubscription);
      mockUserSubscriptionRepository.save.mockResolvedValue({
        ...mockSubscription,
        isActive: true,
      });

      const result = await service.createSubscription(mockUser, createDto);
      expect(result).toEqual({
        ...mockSubscription,
        isActive: true,
      });
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
    it('should update subscription active status', async () => {
      const updateDto = {
        isActive: false,
      };

      const updatedSubscription = {
        ...mockSubscription,
        isActive: false,
      };

      mockUserSubscriptionRepository.findOne.mockResolvedValue(mockSubscription);
      mockUserSubscriptionRepository.save.mockResolvedValue(updatedSubscription);

      const result = await service.updateSubscription(mockUser.id, mockSubscription.id, updateDto);

      expect(mockUserSubscriptionRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockSubscription.id, user: { id: mockUser.id } },
        relations: ['program'],
      });
      expect(result.isActive).toBe(false);
    });

    it('should throw NotFoundException when subscription not found', async () => {
      const updateDto = {
        isActive: false,
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