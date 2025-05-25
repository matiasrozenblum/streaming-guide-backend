import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Device } from './device.entity';
import { User } from './users.entity';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class DeviceService {
  constructor(
    @InjectRepository(Device)
    private deviceRepository: Repository<Device>,
  ) {}

  async findOrCreateDevice(
    user: User,
    userAgent: string,
    deviceId?: string,
  ): Promise<Device> {
    // Generate device ID if not provided
    const finalDeviceId = deviceId || uuidv4();
    
    // Try to find existing device first
    let device = await this.deviceRepository.findOne({
      where: { deviceId: finalDeviceId },
      relations: ['user'],
    });
    
    if (device) {
      // Update last seen and associate with user if not already associated
      if (!device.user || device.user.id !== user.id) {
        device.user = user;
      }
      device.lastSeen = new Date();
      device.userAgent = userAgent;
      return await this.deviceRepository.save(device);
    }

    // Try to create new device
    try {
      const newDevice = this.deviceRepository.create({
        deviceId: finalDeviceId,
        user,
        userAgent,
        deviceType: this.detectDeviceType(userAgent),
        deviceName: this.generateDeviceName(userAgent),
        lastSeen: new Date(),
      });

      return await this.deviceRepository.save(newDevice);
    } catch (error) {
      // If unique constraint violation, try to find the device again
      // This handles race conditions where another request created the device
      if (error.code === '23505') { // PostgreSQL unique violation
        device = await this.deviceRepository.findOne({
          where: { deviceId: finalDeviceId },
          relations: ['user'],
        });
        
        if (device) {
          // Update the existing device
          if (!device.user || device.user.id !== user.id) {
            device.user = user;
          }
          device.lastSeen = new Date();
          device.userAgent = userAgent;
          return await this.deviceRepository.save(device);
        }
      }
      
      // Re-throw if it's not a unique constraint violation or device still not found
      throw error;
    }
  }

  async getUserDevices(userId: number): Promise<Device[]> {
    return await this.deviceRepository.find({
      where: { user: { id: userId } },
      order: { lastSeen: 'DESC' },
    });
  }

  async updateDeviceLastSeen(deviceId: string): Promise<void> {
    await this.deviceRepository.update(
      { deviceId },
      { lastSeen: new Date() },
    );
  }

  private detectDeviceType(userAgent: string): string {
    if (/Mobile|Android|iPhone|iPad/.test(userAgent)) {
      if (/iPad/.test(userAgent)) return 'tablet';
      return 'mobile';
    }
    return 'web';
  }

  private generateDeviceName(userAgent: string): string {
    if (/Chrome/.test(userAgent)) return 'Chrome Browser';
    if (/Firefox/.test(userAgent)) return 'Firefox Browser';
    if (/Safari/.test(userAgent)) return 'Safari Browser';
    if (/Edge/.test(userAgent)) return 'Edge Browser';
    if (/iPhone/.test(userAgent)) return 'iPhone';
    if (/iPad/.test(userAgent)) return 'iPad';
    if (/Android/.test(userAgent)) return 'Android Device';
    return 'Unknown Device';
  }
} 