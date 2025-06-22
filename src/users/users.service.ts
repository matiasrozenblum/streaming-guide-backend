import { ConflictException, Injectable, NotFoundException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './users.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { DeviceService } from './device.service';

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
    const user = this.usersRepository.create(userData as User);
    return this.usersRepository.save(user);
  }

  async findAll(): Promise<User[]> {
    return this.usersRepository.find({
      relations: ['devices', 'subscriptions', 'subscriptions.program'],
    });
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
    const user = await this.findOne(id);
  
    if (updateUserDto.password) {
      updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
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

  async remove(id: number): Promise<void> {
    const result = await this.usersRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ 
      where: { email },
      relations: ['devices', 'subscriptions'],
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