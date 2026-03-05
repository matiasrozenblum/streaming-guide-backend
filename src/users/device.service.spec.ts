import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeviceService } from './device.service';
import { Device } from './device.entity';
import { User } from './users.entity';

describe('DeviceService', () => {
  let service: DeviceService;
  let repository: Repository<Device>;

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

  const mockDevice: Device = {
    id: 'test-device-uuid',
    deviceId: 'test-device-id',
    user: mockUser,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    deviceType: 'web',
    deviceName: 'Chrome Browser',
    lastSeen: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    pushSubscriptions: [],
    platform: 'web',
    fcmToken: 'test-fcm-token',
    appVersion: '1.0.0',
  };

  const mockRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    find: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceService,
        {
          provide: getRepositoryToken(Device),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<DeviceService>(DeviceService);
    repository = module.get<Repository<Device>>(getRepositoryToken(Device));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findOrCreateDevice', () => {
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

    it('should return existing device when found', async () => {
      const deviceId = 'existing-device-id';
      mockRepository.findOne.mockResolvedValue(mockDevice);
      mockRepository.save.mockResolvedValue(mockDevice);

      const result = await service.findOrCreateDevice(mockUser, userAgent, deviceId);

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { deviceId },
        relations: ['user'],
      });
      expect(mockRepository.save).toHaveBeenCalled();
      expect(result).toEqual(mockDevice);
    });

    it('should create new device when not found', async () => {
      const deviceId = 'new-device-id';
      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue(mockDevice);
      mockRepository.save.mockResolvedValue(mockDevice);

      const result = await service.findOrCreateDevice(mockUser, userAgent, deviceId);

      expect(mockRepository.create).toHaveBeenCalledWith({
        deviceId,
        user: mockUser,
        userAgent,
        deviceType: 'mobile',
        deviceName: 'Chrome Browser',
        lastSeen: expect.any(Date),
        platform: 'web',
        appVersion: undefined,
        fcmToken: undefined,
      });
      expect(mockRepository.save).toHaveBeenCalled();
      expect(result).toEqual(mockDevice);
    });

    it('should generate device ID when not provided', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue(mockDevice);
      mockRepository.save.mockResolvedValue(mockDevice);

      await service.findOrCreateDevice(mockUser, userAgent);

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceId: expect.any(String),
          user: mockUser,
          userAgent,
        })
      );
    });
  });

  describe('getUserDevices', () => {
    it('should return user devices ordered by last seen', async () => {
      const devices = [mockDevice];
      mockRepository.find.mockResolvedValue(devices);

      const result = await service.getUserDevices(1);

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { user: { id: 1 } },
        order: { lastSeen: 'DESC' },
      });
      expect(result).toEqual(devices);
    });
  });
});