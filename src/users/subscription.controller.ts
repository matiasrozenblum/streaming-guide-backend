import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubscriptionService, CreateSubscriptionDto, UpdateSubscriptionDto } from './subscription.service';
import { DeviceService } from './device.service';

@Controller('subscriptions')
@UseGuards(JwtAuthGuard)
export class SubscriptionController {
  constructor(
    private subscriptionService: SubscriptionService,
    private deviceService: DeviceService,
  ) {}

  @Post()
  async createSubscription(
    @Request() req: any,
    @Body() dto: CreateSubscriptionDto,
  ) {
    const user = req.user;
    const subscription = await this.subscriptionService.createSubscription(user, dto);
    
    return {
      message: 'Successfully subscribed to program',
      subscription: {
        id: subscription.id,
        programId: subscription.program.id,
        notificationMethod: subscription.notificationMethod,
        createdAt: subscription.createdAt,
      },
    };
  }

  @Get()
  async getUserSubscriptions(@Request() req: any) {
    const user = req.user;
    const subscriptions = await this.subscriptionService.getUserSubscriptions(user.id);
    
    return {
      subscriptions: subscriptions.map(sub => ({
        id: sub.id,
        program: {
          id: sub.program.id,
          name: sub.program.name,
          description: sub.program.description,
          logoUrl: sub.program.logo_url,
          channel: {
            id: sub.program.channel.id,
            name: sub.program.channel.name,
          },
        },
        notificationMethod: sub.notificationMethod,
        isActive: sub.isActive,
        createdAt: sub.createdAt,
      })),
    };
  }

  @Put(':id')
  async updateSubscription(
    @Request() req: any,
    @Param('id') subscriptionId: string,
    @Body() dto: UpdateSubscriptionDto,
  ) {
    const user = req.user;
    const subscription = await this.subscriptionService.updateSubscription(
      user.id,
      subscriptionId,
      dto,
    );
    
    return {
      message: 'Subscription updated successfully',
      subscription: {
        id: subscription.id,
        notificationMethod: subscription.notificationMethod,
        isActive: subscription.isActive,
      },
    };
  }

  @Delete(':id')
  async removeSubscription(
    @Request() req: any,
    @Param('id') subscriptionId: string,
  ) {
    const user = req.user;
    await this.subscriptionService.removeSubscription(user.id, subscriptionId);
    
    return {
      message: 'Successfully unsubscribed from program',
    };
  }

  @Get('program/:programId/status')
  async getSubscriptionStatus(
    @Request() req: any,
    @Param('programId') programId: number,
  ) {
    const user = req.user;
    const isSubscribed = await this.subscriptionService.isUserSubscribedToProgram(
      user.id,
      programId,
    );
    
    return {
      isSubscribed,
      programId,
    };
  }

  @Post('device')
  async registerDevice(
    @Request() req: any,
    @Body() body: { deviceId?: string },
  ) {
    const user = req.user;
    const userAgent = req.headers['user-agent'] || 'Unknown';
    
    const device = await this.deviceService.findOrCreateDevice(
      user,
      userAgent,
      body.deviceId,
    );
    
    return {
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      deviceType: device.deviceType,
    };
  }
} 