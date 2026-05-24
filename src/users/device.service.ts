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
    platform?: 'ios' | 'android' | 'web',
    fcmToken?: string,
    appVersion?: string,
  ): Promise<Device> {
    console.log('🔍 [DeviceService] findOrCreateDevice called with:', {
      userId: user.id,
      userEmail: user.email,
      userAgent,
      deviceId,
      platform,
      appVersion,
      timestamp: new Date().toISOString(),
    });

    // Generate device ID if not provided
    const finalDeviceId = deviceId || uuidv4();
    console.log('📱 [DeviceService] Using device ID:', finalDeviceId);

    // Try to find existing device first
    let device = await this.deviceRepository.findOne({
      where: { deviceId: finalDeviceId },
      relations: ['user'],
    });

    if (device) {
      console.log('✅ [DeviceService] Found existing device:', {
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        currentUserId: device.user?.id,
        newUserId: user.id,
        lastSeen: device.lastSeen,
      });

      // Update basic fields
      device.userAgent = userAgent;
      if (platform) device.platform = platform;
      if (fcmToken) device.fcmToken = fcmToken;
      if (appVersion) device.appVersion = appVersion;

      // Update last seen and associate with user if not already associated
      if (!device.user || device.user.id !== user.id) {
        console.log('🔄 [DeviceService] Updating device user association');
        device.user = user;
        device.lastSeen = new Date();
      } else {
        // Only update lastSeen if it's been more than 5 minutes since last update
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        if (!device.lastSeen || device.lastSeen < fiveMinutesAgo) {
          console.log(
            '🔄 [DeviceService] Updating lastSeen (more than 5 minutes since last update)',
          );
          device.lastSeen = new Date();
        } else {
          console.log(
            '⏭️ [DeviceService] Skipping lastSeen update (updated recently)',
          );
        }
      }

      const updatedDevice = await this.deviceRepository.save(device);
      console.log('✅ [DeviceService] Updated existing device');
      return updatedDevice;
    }

    console.log(
      '🆕 [DeviceService] No existing device found, creating new one',
    );

    // Try to create new device
    try {
      const newDevice = this.deviceRepository.create({
        deviceId: finalDeviceId,
        user,
        userAgent,
        deviceType: deviceId ? 'mobile' : this.detectDeviceType(userAgent), // Assume mobile if deviceId provided manually, else detect
        platform: platform || 'web',
        fcmToken,
        appVersion,
        deviceName: this.generateDeviceName(userAgent),
        lastSeen: new Date(),
      });

      console.log('💾 [DeviceService] Creating new device:', {
        deviceId: newDevice.deviceId,
        deviceName: newDevice.deviceName,
        deviceType: newDevice.deviceType,
        userAgent: newDevice.userAgent,
        userId: user.id,
      });

      const savedDevice = await this.deviceRepository.save(newDevice);
      console.log(
        '✅ [DeviceService] Successfully created new device with ID:',
        savedDevice.id,
      );
      return savedDevice;
    } catch (error) {
      console.error('❌ [DeviceService] Error creating device:', error);

      // If unique constraint violation, try to find the device again
      // This handles race conditions where another request created the device
      if (error.code === '23505') {
        // PostgreSQL unique violation
        console.log(
          '🔄 [DeviceService] Unique constraint violation, trying to find existing device',
        );
        device = await this.deviceRepository.findOne({
          where: { deviceId: finalDeviceId },
          relations: ['user'],
        });

        if (device) {
          console.log(
            '✅ [DeviceService] Found device after constraint violation:',
            device.deviceId,
          );
          // Update the existing device
          if (!device.user || device.user.id !== user.id) {
            device.user = user;
            device.lastSeen = new Date();
          } else {
            // Only update lastSeen if it's been more than 5 minutes since last update
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            if (!device.lastSeen || device.lastSeen < fiveMinutesAgo) {
              device.lastSeen = new Date();
            }
          }
          device.userAgent = userAgent;
          const updatedDevice = await this.deviceRepository.save(device);
          console.log(
            '✅ [DeviceService] Updated device after constraint violation',
          );
          return updatedDevice;
        } else {
          console.error(
            '❌ [DeviceService] Device not found even after constraint violation',
          );
        }
      }

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
    await this.deviceRepository.update({ deviceId }, { lastSeen: new Date() });
  }

  async findDeviceByUser(userId: number): Promise<Device | null> {
    console.log('🔍 [DeviceService] findDeviceByUser called with:', {
      userId,
      timestamp: new Date().toISOString(),
    });

    const device = await this.deviceRepository.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });

    if (device) {
      console.log('✅ [DeviceService] Found device for user:', {
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        userId: device.user?.id,
      });
    } else {
      console.log('❌ [DeviceService] No device found for user:', userId);
    }

    return device;
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
