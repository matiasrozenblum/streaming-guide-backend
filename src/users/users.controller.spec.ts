import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AuthService } from '../auth/auth.service';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/roles.decorator';

const mockUser = {
  id: 1,
  email: 'test@example.com',
  password: 'hashedPassword',
  phone: '1234567890',
  firstName: 'John',
  lastName: 'Doe',
  role: 'user',
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
};

const mockAuthService = {};

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
      const dto = { email: 'a', password: 'b', phone: 'c', firstName: 'd', lastName: 'e' };
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

  describe('changePassword', () => {
    it('should change password for authenticated user', async () => {
      usersService.changePassword.mockResolvedValue(undefined);
      const req = mockRequest({ sub: mockUser.id });
      const body = { currentPassword: 'old', newPassword: 'new' };
      const result = await controller.changePassword(req, body);
      expect(usersService.changePassword).toHaveBeenCalledWith(mockUser.id, 'old', 'new');
      expect(result).toEqual({ message: 'Password updated successfully' });
    });
    it('should throw UnauthorizedException if service throws UnauthorizedException', async () => {
      usersService.changePassword.mockRejectedValue(new UnauthorizedException('bad'));
      const req = mockRequest({ sub: mockUser.id });
      const body = { currentPassword: 'old', newPassword: 'new' };
      await expect(controller.changePassword(req, body)).rejects.toThrow(UnauthorizedException);
    });
    it('should wrap other errors as UnauthorizedException', async () => {
      usersService.changePassword.mockRejectedValue(new Error('other'));
      const req = mockRequest({ sub: mockUser.id });
      const body = { currentPassword: 'old', newPassword: 'new' };
      await expect(controller.changePassword(req, body)).rejects.toThrow(UnauthorizedException);
    });
  });
}); 