import { Controller, Post, Body, Get, Logger, Param } from '@nestjs/common';
import { PushService } from './push.service';
import { CreatePushSubscriptionDto } from './dto/create-push-subscription.dto';
import { ScheduleNotificationDto } from './dto/schedule-notification.dto';

@Controller('push')
export class PushController {
  private readonly logger = new Logger(PushController.name);
  constructor(private svc: PushService) { }

  @Get('vapidPublicKey')
  getVapidPublicKey() {
    return { publicKey: process.env.VAPID_PUBLIC_KEY };
  }

  @Post('subscribe')
  subscribe(@Body() dto: CreatePushSubscriptionDto) {
    return this.svc.create(dto);
  }

  @Post('fcm/subscribe')
  subscribeFCM(@Body() body: { deviceId: string; fcmToken: string; platform: 'ios' | 'android' | 'web' }) {
    this.logger.log(`📱 FCM subscribe request: deviceId=${body.deviceId}, platform=${body.platform}, tokenPrefix=${body.fcmToken?.substring(0, 20)}...`);
    return this.svc.createFCM(body.deviceId, body.fcmToken, body.platform);
  }

  @Get('test-fcm/:token')
  async testFcm(@Param('token') token: string) {
    return this.svc.testFcmToken(token);
  }

  @Get('test-real')
  async testRealTokens() {
    return this.svc.testRealTokens();
  }

  @Post('fcm/unsubscribe')
  unsubscribeFCM(@Body() body: { deviceId: string }) {
    return this.svc.unsubscribeFCM(body.deviceId);
  }

  @Post('schedule')
  scheduleNotification(
    @Body() dto: ScheduleNotificationDto,
  ) {
    const { programId, title, minutesBefore } = dto;
    return this.svc.scheduleForProgram(
      programId,
      title,
      minutesBefore,
    );
  }
}