import { Controller, Post, Body, Get } from '@nestjs/common';
import { PushService } from './push.service';
import { CreatePushSubscriptionDto } from './dto/create-push-subscription.dto';
import { ScheduleNotificationDto } from './dto/schedule-notification.dto';

@Controller('push')
export class PushController {
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
    return this.svc.createFCM(body.deviceId, body.fcmToken, body.platform);
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