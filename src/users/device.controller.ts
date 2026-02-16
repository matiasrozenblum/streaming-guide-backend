import { Controller, Delete, Param, UseGuards, NotFoundException, Post, Body, Req } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { InjectRepository } from '@nestjs/typeorm';
import { Device } from './device.entity';
import { Repository } from 'typeorm';
import { DeviceService } from './device.service';

@Controller('admin/devices')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class DeviceController {
  constructor(
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
    private readonly deviceService: DeviceService,
  ) { }

  @Post('register')
  async register(@Req() req, @Body() body: any) {
    const { deviceId, platform, userAgent, appVersion, fcmToken } = body;
    console.log('📱 [DeviceController] Registering device:', {
      userId: req.user.id,
      deviceId,
      platform
    });

    return await this.deviceService.findOrCreateDevice(
      req.user,
      userAgent || 'Unknown Mobile',
      deviceId,
      platform,
      fcmToken,
      appVersion
    );
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<void> {
    const result = await this.deviceRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Device with ID ${id} not found`);
    }
  }
} 