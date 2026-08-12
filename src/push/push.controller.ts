import {
  Controller,
  Post,
  Body,
  Get,
  Logger,
  Request,
  UseGuards,
} from '@nestjs/common';
import { PushService } from './push.service';
import { CreatePushSubscriptionDto } from './dto/create-push-subscription.dto';
import { ScheduleNotificationDto } from './dto/schedule-notification.dto';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';

@Controller('push')
export class PushController {
  private readonly logger = new Logger(PushController.name);
  constructor(private svc: PushService) {}

  @Get('vapidPublicKey')
  getVapidPublicKey() {
    return { publicKey: process.env.VAPID_PUBLIC_KEY };
  }

  @Post('subscribe')
  subscribe(@Body() dto: CreatePushSubscriptionDto) {
    return this.svc.create(dto);
  }

  /**
   * Optional auth rather than a hard guard: the caller may legitimately be
   * anonymous when the device has never been claimed by a user. What must not
   * happen is an unauthenticated call re-subscribing a device that *is* owned —
   * that is how a logged-out app resurrected its own push subscription moments
   * after logout and kept delivering notifications for days. Ownership is
   * enforced in the service.
   */
  @Post('fcm/subscribe')
  @UseGuards(OptionalJwtAuthGuard)
  subscribeFCM(
    @Request() req: any,
    @Body()
    body: {
      deviceId: string;
      fcmToken: string;
      platform: 'ios' | 'android' | 'web';
    },
  ) {
    this.logger.log(
      `📱 FCM subscribe request: deviceId=${body.deviceId}, platform=${body.platform}, userId=${req.user?.id ?? 'anonymous'}, tokenPrefix=${body.fcmToken?.substring(0, 20)}...`,
    );
    return this.svc.createFCM(
      body.deviceId,
      body.fcmToken,
      body.platform,
      req.user?.id ?? null,
    );
  }

  @Post('fcm/unsubscribe')
  unsubscribeFCM(@Body() body: { deviceId: string }) {
    this.logger.log(`📱 FCM unsubscribe request: deviceId=${body.deviceId}`);
    return this.svc.unsubscribeFCM(body.deviceId);
  }

  @Post('schedule')
  scheduleNotification(@Body() dto: ScheduleNotificationDto) {
    const { programId, title, minutesBefore } = dto;
    return this.svc.scheduleForProgram(programId, title, minutesBefore);
  }
}
