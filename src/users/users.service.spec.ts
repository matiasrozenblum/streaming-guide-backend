import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from './users.service';
import { User } from './users.entity';
import { DeviceService } from './device.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { NotFoundException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

describe('UsersService', () => {
  let service: UsersService;
  let repository: Repository<User>;
  let deviceService: DeviceService;

  const mockUser = {
    id: 1,
    email: 'test@example.com',
    password: 'hashedPassword',
    phone: '1234567890',
    firstName: 'John',
    lastName: 'Doe',
    gender: 'male' as const,
    birthDate: new Date('1990-01-01'),
    role: 'user' as const,
  };

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    delete: jest.fn(),
  };

  const mockDeviceService = {
    findOrCreateDevice: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: mockRepository,
        },
        {
          provide: DeviceService,
          useValue: mockDeviceService,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    repository = module.get<Repository<User>>(getRepositoryToken(User));
    deviceService = module.get<DeviceService>(DeviceService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new user with hashed password', async () => {
      const createUserDto: CreateUserDto = {
        email: 'test@example.com',
        password: 'password123',
        phone: '1234567890',
        firstName: 'John',
        lastName: 'Doe',
        gender: 'male' as const,
        birthDate: '1990-01-01'
      };

      const hashedPassword = 'hashedPassword123';
      jest.spyOn(bcrypt, 'hash').mockResolvedValue(hashedPassword as never);
      mockRepository.create.mockReturnValue({ 
        ...createUserDto, 
        password: hashedPassword,
        birthDate: new Date(createUserDto.birthDate!)
      });
      mockRepository.save.mockResolvedValue({ 
        ...mockUser, 
        password: hashedPassword,
        gender: createUserDto.gender,
        birthDate: new Date(createUserDto.birthDate!)
      });

      const result = await service.create(createUserDto);

      expect(bcrypt.hash).toHaveBeenCalledWith(createUserDto.password, 10);
      expect(mockRepository.create).toHaveBeenCalledWith({
        ...createUserDto,
        password: hashedPassword,
        birthDate: new Date(createUserDto.birthDate!)
      });
      expect(mockRepository.save).toHaveBeenCalled();
      expect(result).toEqual({ 
        ...mockUser, 
        password: hashedPassword,
        gender: createUserDto.gender,
        birthDate: new Date(createUserDto.birthDate!)
      });
    });

    it('should create a user without optional fields', async () => {
      const createUserDto = {
        email: 'test2@example.com',
        password: 'password123',
        firstName: 'Test2',
        lastName: 'User2',
        gender: 'male' as const,
        birthDate: '1990-01-01',
      };

      const hashedPassword = 'hashedPassword123';
      jest.spyOn(bcrypt, 'hash').mockResolvedValue(hashedPassword as never);
      mockRepository.create.mockReturnValue({ 
        ...createUserDto, 
        password: hashedPassword,
        birthDate: new Date(createUserDto.birthDate!)
      });
      mockRepository.save.mockResolvedValue({ 
        ...mockUser, 
        password: hashedPassword,
        gender: createUserDto.gender,
        birthDate: new Date(createUserDto.birthDate!)
      });

      const result = await service.create(createUserDto);

      expect(bcrypt.hash).toHaveBeenCalledWith(createUserDto.password, 10);
      expect(mockRepository.create).toHaveBeenCalledWith({
        ...createUserDto,
        password: hashedPassword,
        birthDate: new Date(createUserDto.birthDate!)
      });
      expect(mockRepository.save).toHaveBeenCalled();
      expect(result).toEqual({ 
        ...mockUser, 
        password: hashedPassword,
        gender: createUserDto.gender,
        birthDate: new Date(createUserDto.birthDate!)
      });
    });

    it('should throw BadRequestException if birthDate is missing', async () => {
      const createUserDto = {
        email: 'test3@example.com',
        password: 'password123',
        firstName: 'Test3',
        lastName: 'User3',
        gender: 'male' as const,
        // birthDate missing
      };
      await expect(service.create(createUserDto as any)).rejects.toThrow('La fecha de nacimiento es obligatoria');
    });
  });

  describe('findAll', () => {
    it('should return an array of users', async () => {
      mockRepository.find.mockResolvedValue([mockUser]);

      const result = await service.findAll();

      expect(mockRepository.find).toHaveBeenCalled();
      expect(result).toEqual([mockUser]);
    });
  });

  describe('findOne', () => {
    it('should return a user by id', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.findOne(1);

      expect(mockRepository.findOne).toHaveBeenCalledWith({ 
        where: { id: 1 },
        relations: ['devices', 'subscriptions'],
      });
      expect(result).toEqual(mockUser);
    });

    it('should throw NotFoundException when user is not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a user and hash password if provided', async () => {
      const updateUserDto: UpdateUserDto = {
        password: 'newPassword123',
        firstName: 'Jane',
      };

      const hashedPassword = 'newHashedPassword';
      jest.spyOn(bcrypt, 'hash').mockResolvedValue(hashedPassword as never);
      mockRepository.findOne.mockResolvedValue(mockUser);
      mockRepository.save.mockResolvedValue({ ...mockUser, ...updateUserDto, password: hashedPassword });

      const result = await service.update(1, updateUserDto);

      expect(bcrypt.hash).toHaveBeenCalledWith('newPassword123', 10);
      expect(mockRepository.save).toHaveBeenCalled();
      expect(result).toEqual({ ...mockUser, ...updateUserDto, password: hashedPassword });
    });
  });

  describe('remove', () => {
    it('should delete a user', async () => {
      mockRepository.delete.mockResolvedValue({ affected: 1 });

      await service.remove(1);

      expect(mockRepository.delete).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundException when user is not found', async () => {
      mockRepository.delete.mockResolvedValue({ affected: 0 });

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByEmail', () => {
    it('should return a user by email', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.findByEmail('test@example.com');

      expect(mockRepository.findOne).toHaveBeenCalledWith({ 
        where: { email: 'test@example.com' },
      });
      expect(result).toEqual(mockUser);
    });
  });

  describe('findByPhone', () => {
    it('should return a user by phone', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.findByPhone('1234567890');

      expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { phone: '1234567890' } });
      expect(result).toEqual(mockUser);
    });
  });

  describe('changePassword', () => {
    it('should change password when current password is correct', async () => {
      const currentPassword = 'currentPassword';
      const newPassword = 'newPassword';
      const hashedCurrentPassword = 'hashedCurrentPassword';
      const hashedNewPassword = 'hashedNewPassword';

      mockRepository.findOne.mockResolvedValue({ ...mockUser, password: hashedCurrentPassword });
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
      jest.spyOn(bcrypt, 'hash').mockResolvedValue(hashedNewPassword as never);
      mockRepository.save.mockResolvedValue({ ...mockUser, password: hashedNewPassword });

      await service.changePassword(1, currentPassword, newPassword);

      expect(bcrypt.compare).toHaveBeenCalledWith(currentPassword, hashedCurrentPassword);
      expect(bcrypt.hash).toHaveBeenCalledWith(newPassword, 10);
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when current password is incorrect', async () => {
      const currentPassword = 'wrongPassword';
      const newPassword = 'newPassword';
      const hashedCurrentPassword = 'hashedCurrentPassword';

      mockRepository.findOne.mockResolvedValue({ ...mockUser, password: hashedCurrentPassword });
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      await expect(service.changePassword(1, currentPassword, newPassword))
        .rejects.toThrow(UnauthorizedException);
    });
  });

  describe('ensureUserDevice', () => {
    it('should create device for user', async () => {
      const userAgent = 'Mozilla/5.0 Chrome/91.0';
      const deviceId = 'test-device-id';
      const mockDevice = { deviceId: 'created-device-id' };

      mockDeviceService.findOrCreateDevice.mockResolvedValue(mockDevice);

      const result = await service.ensureUserDevice(mockUser as User, userAgent, deviceId);

      expect(mockDeviceService.findOrCreateDevice).toHaveBeenCalledWith(mockUser, userAgent, deviceId);
      expect(result).toBe('created-device-id');
    });

    it('should create device without deviceId', async () => {
      const userAgent = 'Mozilla/5.0 Chrome/91.0';
      const mockDevice = { deviceId: 'auto-generated-device-id' };

      mockDeviceService.findOrCreateDevice.mockResolvedValue(mockDevice);

      const result = await service.ensureUserDevice(mockUser as User, userAgent);

      expect(mockDeviceService.findOrCreateDevice).toHaveBeenCalledWith(mockUser, userAgent, undefined);
      expect(result).toBe('auto-generated-device-id');
    });
  });
}); 