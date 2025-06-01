import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AuthService } from '../auth/auth.service';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { OtpService } from '../auth/otp.service';

const mockUser = {
  id: 1,
  email: 'test@example.com',
  password: 'hashedPassword',
  phone: '1234567890',
  firstName: 'John',
  lastName: 'Doe',
  role: 'user',
  gender: 'male' as const,
  birthDate: new Date('1990-01-01'),
};

const mockAdmin = {
  ...mockUser,
  id: 2,
  email: 'admin@example.com',
  role: 'admin',
};

const mockUsersService = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  changePassword: jest.fn(),
  findByEmail: jest.fn(),
};

const mockAuthService = {};

const mockOtpService = {
  verifyCode: jest.fn(),
};

const mockRequest = (user) => ({ user });

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: typeof mockUsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: mockUsersService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: OtpService, useValue: mockOtpService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<UsersController>(UsersController);
    usersService = module.get(UsersService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should call usersService.create with dto', async () => {
      const dto = { 
        email: 'a', 
        password: 'b', 
        phone: 'c', 
        firstName: 'd', 
        lastName: 'e',
        gender: 'male' as const
      };
      usersService.create.mockResolvedValue({ ...mockUser, ...dto });
      const result = await controller.create(dto);
      expect(usersService.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual({ ...mockUser, ...dto });
    });
  });

  describe('findAll', () => {
    it('should return all users (admin only)', async () => {
      usersService.findAll.mockResolvedValue([mockUser, mockAdmin]);
      const result = await controller.findAll();
      expect(usersService.findAll).toHaveBeenCalled();
      expect(result).toEqual([mockUser, mockAdmin]);
    });
  });

  describe('getProfile', () => {
    it('should return the authenticated user profile', async () => {
      usersService.findOne.mockResolvedValue(mockUser);
      const req = mockRequest({ id: mockUser.id });
      const result = await controller.getProfile(req);
      expect(usersService.findOne).toHaveBeenCalledWith(mockUser.id);
      expect(result).toEqual(mockUser);
    });
  });

  describe('findOne', () => {
    it('should allow admin to get any user', async () => {
      usersService.findOne.mockResolvedValue(mockUser);
      const req = mockRequest({ id: mockAdmin.id, role: 'admin' });
      const result = await controller.findOne(String(mockUser.id), req);
      expect(result).toEqual(mockUser);
    });
    it('should allow user to get own profile', async () => {
      usersService.findOne.mockResolvedValue(mockUser);
      const req = mockRequest({ id: mockUser.id, role: 'user' });
      const result = await controller.findOne(String(mockUser.id), req);
      expect(result).toEqual(mockUser);
    });
    it('should throw ForbiddenException if not admin or owner', async () => {
      const req = mockRequest({ id: 99, role: 'user' });
      try {
        await controller.findOne(String(mockUser.id), req);
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ForbiddenException);
        expect(e.message).toContain('No autorizado');
      }
    });
  });

  describe('update', () => {
    it('should allow admin to update any user', async () => {
      usersService.update.mockResolvedValue({ ...mockUser, firstName: 'Updated' });
      const req = mockRequest({ id: mockAdmin.id, role: 'admin' });
      const dto = { firstName: 'Updated' };
      const result = await controller.update(String(mockUser.id), dto, req);
      expect(usersService.update).toHaveBeenCalledWith(mockUser.id, dto);
      expect(result).toEqual({ ...mockUser, firstName: 'Updated' });
    });
    it('should allow user to update own profile', async () => {
      usersService.update.mockResolvedValue({ ...mockUser, firstName: 'Me' });
      const req = mockRequest({ id: mockUser.id, role: 'user' });
      const dto = { firstName: 'Me' };
      const result = await controller.update(String(mockUser.id), dto, req);
      expect(result).toEqual({ ...mockUser, firstName: 'Me' });
    });
    it('should throw ForbiddenException if not admin or owner', async () => {
      const req = mockRequest({ id: 99, role: 'user' });
      try {
        await controller.update(String(mockUser.id), {}, req);
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ForbiddenException);
        expect(e.message).toContain('No autorizado');
      }
    });
  });

  describe('remove', () => {
    it('should allow admin to remove any user', async () => {
      usersService.remove.mockResolvedValue(undefined);
      const req = mockRequest({ id: mockAdmin.id, role: 'admin' });
      const result = await controller.remove(String(mockUser.id), req);
      expect(usersService.remove).toHaveBeenCalledWith(mockUser.id);
      expect(result).toBeUndefined();
    });
    it('should allow user to remove own account', async () => {
      usersService.remove.mockResolvedValue(undefined);
      const req = mockRequest({ id: mockUser.id, role: 'user' });
      const result = await controller.remove(String(mockUser.id), req);
      expect(result).toBeUndefined();
    });
    it('should throw ForbiddenException if not admin or owner', async () => {
      const req = mockRequest({ id: 99, role: 'user' });
      try {
        await controller.remove(String(mockUser.id), req);
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ForbiddenException);
        expect(e.message).toContain('No autorizado');
      }
    });
  });

  describe('resetPassword', () => {
    let otpService;
    beforeEach(() => {
      otpService = { verifyCode: jest.fn() };
      controller.otpService = otpService;
    });

    it('should reset password if code is valid and user exists', async () => {
      otpService.verifyCode.mockResolvedValue(undefined);
      usersService.findByEmail.mockResolvedValue(mockUser);
      usersService.update.mockResolvedValue({ ...mockUser, password: 'new' });
      const body = { email: mockUser.email, password: 'new', code: '123456' };
      const result = await controller.resetPassword(body);
      expect(otpService.verifyCode).toHaveBeenCalledWith(mockUser.email, '123456');
      expect(usersService.findByEmail).toHaveBeenCalledWith(mockUser.email);
      expect(usersService.update).toHaveBeenCalledWith(mockUser.id, { password: 'new' });
      expect(result).toEqual({ message: 'Password reset successfully' });
    });

    it('should throw UnauthorizedException if code is invalid', async () => {
      otpService.verifyCode.mockRejectedValue(new UnauthorizedException('bad code'));
      const body = { email: mockUser.email, password: 'new', code: 'bad' };
      await expect(controller.resetPassword(body)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw NotFoundException if user not found', async () => {
      otpService.verifyCode.mockResolvedValue(undefined);
      usersService.findByEmail.mockResolvedValue(null);
      const body = { email: 'notfound@example.com', password: 'new', code: '123456' };
      await expect(controller.resetPassword(body)).rejects.toThrow('Usuario no encontrado');
    });
  });
}); 