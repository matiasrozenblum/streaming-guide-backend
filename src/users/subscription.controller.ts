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
import { UsersService } from './users.service';

@Controller('subscriptions')
@UseGuards(JwtAuthGuard)
export class SubscriptionController {
  constructor(
    private subscriptionService: SubscriptionService,
    private deviceService: DeviceService,
    private usersService: UsersService,
  ) {}

  @Post()
  async createSubscription(
    @Request() req: any,
    @Body() dto: CreateSubscriptionDto,
  ) {
    const userFromToken = req.user;
    
    // Check if this is a legacy authentication token
    if (userFromToken.type === 'public' && (typeof userFromToken.id === 'string' || userFromToken.id === 'public')) {
      return {
        error: 'Subscriptions not available for legacy authentication',
        message: 'Please register with a user account to use subscription features',
      };
    }
    
    // For real users, fetch the actual User entity from database
    const user = await this.usersService.findOne(userFromToken.id);
    if (!user) {
      return {
        error: 'User not found',
        message: 'Unable to create subscription for this user',
      };
    }
    
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
    const userFromToken = req.user;
    
    // Check if this is a legacy authentication token
    if (userFromToken.type === 'public' && (typeof userFromToken.id === 'string' || userFromToken.id === 'public')) {
      return {
        subscriptions: [],
        message: 'Subscriptions not available for legacy authentication',
      };
    }
    
    const subscriptions = await this.subscriptionService.getUserSubscriptions(userFromToken.id);
    
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
            order: sub.program.channel.order,
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
    const userFromToken = req.user;
    
    // Check if this is a legacy authentication token
    if (userFromToken.type === 'public' && (typeof userFromToken.id === 'string' || userFromToken.id === 'public')) {
      return {
        error: 'Subscriptions not available for legacy authentication',
        message: 'Please register with a user account to use subscription features',
      };
    }
    
    const subscription = await this.subscriptionService.updateSubscription(
      userFromToken.id,
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
    const userFromToken = req.user;
    
    // Check if this is a legacy authentication token
    if (userFromToken.type === 'public' && (typeof userFromToken.id === 'string' || userFromToken.id === 'public')) {
      return {
        error: 'Subscriptions not available for legacy authentication',
        message: 'Please register with a user account to use subscription features',
      };
    }
    
    await this.subscriptionService.removeSubscription(userFromToken.id, subscriptionId);
    
    return {
      message: 'Successfully unsubscribed from program',
    };
  }

  @Get('program/:programId/status')
  async getSubscriptionStatus(
    @Request() req: any,
    @Param('programId') programId: number,
  ) {
    const userFromToken = req.user;
    
    // Check if this is a legacy authentication token
    if (userFromToken.type === 'public' && (typeof userFromToken.id === 'string' || userFromToken.id === 'public')) {
      return {
        isSubscribed: false,
        programId,
        message: 'Subscriptions not available for legacy authentication',
      };
    }
    
    const isSubscribed = await this.subscriptionService.isUserSubscribedToProgram(
      userFromToken.id,
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
    @Body() body: { deviceId?: string; platform?: 'ios' | 'android' | 'web'; fcmToken?: string; appVersion?: string },
  ) {
    const userFromToken = req.user;

    console.log('🔍 [SubscriptionController] device registration called with:', {
      userId: userFromToken.id,
      userType: userFromToken.type,
      userRole: userFromToken.role,
      deviceId: body.deviceId,
      platform: body.platform,
      userAgent: req.headers['user-agent'],
      timestamp: new Date().toISOString()
    });

    // Check if this is a legacy authentication token
    if (userFromToken.type === 'public' && (typeof userFromToken.id === 'string' || userFromToken.id === 'public')) {
      console.log('⏭️ [SubscriptionController] Skipping device registration for legacy user');
      return {
        error: 'Device registration not available for legacy authentication',
        message: 'Please register with a user account to use device features',
      };
    }

    // For real users, fetch the actual User entity from database
    const user = await this.usersService.findOne(userFromToken.id);
    if (!user) {
      console.log('❌ [SubscriptionController] User not found:', userFromToken.id);
      return {
        error: 'User not found',
        message: 'Unable to register device for this user',
      };
    }

    console.log('✅ [SubscriptionController] User found, proceeding with device registration');
    const userAgent = req.headers['user-agent'] || 'Unknown';

    const device = await this.deviceService.findOrCreateDevice(
      user,
      userAgent,
      body.deviceId,
      body.platform,
      body.fcmToken,
      body.appVersion,
    );

    console.log('✅ [SubscriptionController] Device registration completed:', device.deviceId);

    return {
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      deviceType: device.deviceType,
    };
  }

  @Get('device')
  async getDevice(
    @Request() req: any,
  ) {
    const userFromToken = req.user;
    
    console.log('🔍 [SubscriptionController] device check called with:', {
      userId: userFromToken.id,
      userType: userFromToken.type,
      userRole: userFromToken.role,
      timestamp: new Date().toISOString()
    });
    
    // Check if this is a legacy authentication token
    if (userFromToken.type === 'public' && (typeof userFromToken.id === 'string' || userFromToken.id === 'public')) {
      console.log('⏭️ [SubscriptionController] Skipping device check for legacy user');
      return {
        error: 'Device check not available for legacy authentication',
        message: 'Please register with a user account to use device features',
      };
    }
    
    // For real users, fetch the actual User entity from database
    const user = await this.usersService.findOne(userFromToken.id);
    if (!user) {
      console.log('❌ [SubscriptionController] User not found:', userFromToken.id);
      return {
        error: 'User not found',
        message: 'Unable to check device for this user',
      };
    }
    
    // Find the user's device
    const device = await this.deviceService.findDeviceByUser(user.id);
    
    if (!device) {
      return {
        error: 'Device not found',
        message: 'No device registered for this user',
      };
    }
    
    console.log('✅ [SubscriptionController] Device found:', device.deviceId);
    
    return {
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      deviceType: device.deviceType,
    };
  }
} 