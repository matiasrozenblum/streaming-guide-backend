import { ConflictException, Injectable, NotFoundException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './users.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { DeviceService } from './device.service';
import { randomBytes } from 'crypto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private deviceService: DeviceService,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const { password, birthDate, gender, ...rest } = createUserDto;
    // Validate age
    if (!birthDate) {
      throw new BadRequestException('La fecha de nacimiento es obligatoria');
    }
    const birth = new Date(birthDate);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
      age--;
    }
    if (age < 18) {
      throw new BadRequestException('Debes ser mayor de 18 años para registrarte');
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const userData = {
      ...rest,
      password: hashedPassword,
      gender,
      birthDate: birthDate ? new Date(birthDate) : undefined,
    };
    const user = this.usersRepository.create(userData);
    const saved = await this.usersRepository.save(user);
    if (Array.isArray(saved)) {
      throw new Error('Unexpected array returned from save when saving a single user');
    }
    return saved;
  }

  /** Create user for social login (no password required) */
  async createSocialUser(body: { firstName: string; lastName: string; email: string; gender?: string; birthDate?: string; origin?: string }): Promise<User> {
    // Generate a random password (not used for login)
    const randomPassword = randomBytes(16).toString('hex'); // always a string
    // Validate gender
    const allowedGenders = ['male', 'female', 'non_binary', 'rather_not_say'];
    let gender: 'male' | 'female' | 'non_binary' | 'rather_not_say' | undefined = undefined;
    if (body.gender && allowedGenders.includes(body.gender)) {
      gender = body.gender as 'male' | 'female' | 'non_binary' | 'rather_not_say';
    }
    // Validate origin
    const allowedOrigins = ['traditional', 'google', 'facebook'];
    let origin: 'traditional' | 'google' | 'facebook' = 'traditional';
    if (body.origin && allowedOrigins.includes(body.origin)) {
      origin = body.origin as 'traditional' | 'google' | 'facebook';
    }
    const userData: any = {
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email,
      password: await bcrypt.hash(randomPassword, 10),
      role: 'user',
      origin: origin,
    };
    if (gender) userData.gender = gender;
    if (body.birthDate) userData.birthDate = new Date(body.birthDate);
    const user = this.usersRepository.create(userData);
    const saved = await this.usersRepository.save(user);
    if (Array.isArray(saved)) {
      throw new Error('Unexpected array returned from save when saving a single user');
    }
    return saved;
  }

  async findAll(page: number = 1, pageSize: number = 20): Promise<{ users: User[]; total: number; page: number; pageSize: number }> {
    const skip = (page - 1) * pageSize;
    
    const [users, total] = await this.usersRepository.findAndCount({
      relations: ['devices', 'subscriptions', 'subscriptions.program'],
      skip,
      take: pageSize,
      order: { id: 'DESC' }, // Show newest users first
    });

    return {
      users,
      total,
      page,
      pageSize,
    };
  }

  async findOne(id: number): Promise<User> {
    const user = await this.usersRepository.findOne({ 
      where: { id },
      relations: ['devices', 'subscriptions'],
    });
    if (!user) throw new NotFoundException(`User with ID ${id} not found`);
    return user;
  }

  async update(id: number, updateUserDto: UpdateUserDto): Promise<User> {
    // Optimized: Don't load relations for update operations
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User with ID ${id} not found`);
    
    // Hash password if provided (this is the main performance bottleneck)
    if (updateUserDto.password) {
      updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
    }
    
    // Fix: ensure birthDate is a Date if present
    if (updateUserDto.birthDate && typeof updateUserDto.birthDate === 'string') {
      updateUserDto.birthDate = new Date(updateUserDto.birthDate) as any;
    }
    
    // Fix: ensure gender is correct enum
    const allowedGenders = ['male', 'female', 'non_binary', 'rather_not_say'];
    if (updateUserDto.gender && !allowedGenders.includes(updateUserDto.gender)) {
      updateUserDto.gender = undefined;
    }
    
    const updateData = Object.entries(updateUserDto).reduce((acc, [key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        acc[key] = value;
      }
      return acc;
    }, {} as Partial<User>);
    
    Object.assign(user, updateData);
    try {
      return await this.usersRepository.save(user);
    } catch (error) {
      if (error.code === '23505') {
        // Unique violation
        throw new ConflictException('El email ya está en uso por otro usuario');
      }
      throw error;
    }
  }

  /**
   * Fast profile completion update - optimized for social users (no password hashing)
   */
  async updateProfile(id: number, profileData: { 
    firstName: string; 
    lastName: string; 
    gender: string; 
    birthDate: string; 
    password?: string;
  }): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User with ID ${id} not found`);
    
    // Hash password only if provided (for traditional users)
    if (profileData.password) {
      profileData.password = await bcrypt.hash(profileData.password, 10);
    }
    
    // Ensure birthDate is a Date
    const birthDate = new Date(profileData.birthDate);
    
    // Validate gender
    const allowedGenders = ['male', 'female', 'non_binary', 'rather_not_say'];
    if (!allowedGenders.includes(profileData.gender)) {
      throw new Error('Invalid gender');
    }
    
    // Update user directly without loading relations
    Object.assign(user, {
      firstName: profileData.firstName,
      lastName: profileData.lastName,
      gender: profileData.gender,
      birthDate,
      ...(profileData.password && { password: profileData.password })
    });
    
    try {
      return await this.usersRepository.save(user);
    } catch (error) {
      if (error.code === '23505') {
        throw new ConflictException('El email ya está en uso por otro usuario');
      }
      throw error;
    }
  }

  async remove(id: number): Promise<void> {
    const result = await this.usersRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    console.log('🔍 [UsersService] findByEmail called with:', {
      email,
      timestamp: new Date().toISOString()
    });
    
    const user = await this.usersRepository.findOne({ 
      where: { email },
      relations: ['devices', 'subscriptions'],
    });
    
    console.log('🔍 [UsersService] findByEmail result:', {
      found: !!user,
      userId: user?.id,
      userRole: user?.role,
      userOrigin: user?.origin,
      email
    });
    
    return user;
  }

  /**
   * Fast user lookup by email without relations - for performance-critical operations
   */
  async findByEmailFast(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ 
      where: { email },
      // No relations for better performance
    });
  }

  async findByPhone(phone: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { phone } });
  }

  /**
   * Change password: verify current password and update to new one
   */
  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.findOne(userId);
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    
    if (!isPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedNewPassword;
    await this.usersRepository.save(user);
  }

  /**
   * Ensure user has a device for the current session
   * This is called when a user logs in to automatically create a device if needed
   */
  async ensureUserDevice(user: User, userAgent: string, deviceId?: string): Promise<string> {
    console.log('🔍 [UsersService] ensureUserDevice called with:', {
      userId: user.id,
      userEmail: user.email,
      userAgent,
      deviceId,
      timestamp: new Date().toISOString(),
      stack: new Error().stack?.split('\n').slice(1, 4).join('\n') // Show call stack
    });
    
    const device = await this.deviceService.findOrCreateDevice(user, userAgent, deviceId);
    
    console.log('✅ [UsersService] ensureUserDevice completed:', {
      deviceId: device.deviceId,
      deviceName: device.deviceName
    });
    
    return device.deviceId;
  }
}