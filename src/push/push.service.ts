import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as webPush from 'web-push';
import { PushSubscriptionEntity } from './push-subscription.entity';
import { CreatePushSubscriptionDto } from './dto/create-push-subscription.dto';
import { NotificationsService } from '@/notifications/notifications.service';
import { Device } from '../users/device.entity';

@Injectable()
export class PushService {
  constructor(
    @InjectRepository(PushSubscriptionEntity)
    private repo: Repository<PushSubscriptionEntity>,

    @InjectRepository(Device)
    private deviceRepository: Repository<Device>,

    private notificationsService: NotificationsService,
  ) {
    // Temporarily disable VAPID initialization to prevent startup errors
    // TODO: Set proper VAPID environment variables
    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    
    if (vapidPublicKey && vapidPrivateKey && vapidPublicKey.length > 0 && vapidPrivateKey.length > 0) {
      try {
        webPush.setVapidDetails(
          'mailto:hola@laguiadelstreaming.com',
          vapidPublicKey,
          vapidPrivateKey,
        );
        console.log('✅ VAPID keys initialized successfully');
      } catch (error) {
        console.warn('⚠️ Failed to initialize VAPID keys:', error.message);
      }
    } else {
      console.warn('⚠️ VAPID keys not configured - push notifications will not work');
    }
  }

  async create(dto: CreatePushSubscriptionDto) {
    const { deviceId, subscription } = dto;
    const endpoint = subscription.endpoint;

    // Find the device by deviceId
    const device = await this.deviceRepository.findOne({
      where: { deviceId },
    });

    if (!device) {
      throw new Error('Device not found');
    }

    // 1) Si ya existe la misma subscripción, devolvemos la existente
    const existing = await this.repo.findOne({ 
      where: { device: { id: device.id }, endpoint },
      relations: ['device'],
    });
    if (existing) {
      return existing;
    }

    // 2) Si no existe, creamos y guardamos
    const sub = this.repo.create({
      device,
      endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    });
    return this.repo.save(sub);
  }

  async sendNotification(entity: PushSubscriptionEntity, payload: any) {
    console.log('🔥 Sending push notification to device', entity.device?.deviceId || 'unknown');
    const pushSub = {
      endpoint: entity.endpoint,
      keys: { p256dh: entity.p256dh, auth: entity.auth },
    };
    return webPush.sendNotification(pushSub, JSON.stringify(payload));
  }

  async scheduleForProgram(
    programId: string,
    title: string,
    inMinutes: number
  ): Promise<void> {
    // opcional: dejar un log para saber que el cliente pidió agendar
    console.log(
      `🔔 Cliente pidió scheduleForProgram(${programId}, "${title}", ${inMinutes}m) — ` +
      `las notificaciones se enviarán vía cron 10′ antes`
    );
    return;
  }

  async sendNotificationToDevices(devices: Device[], payload: any): Promise<void> {
    for (const device of devices) {
      if (device.pushSubscriptions && device.pushSubscriptions.length > 0) {
        for (const subscription of device.pushSubscriptions) {
          try {
            await this.sendNotification(subscription, payload);
          } catch (error) {
            console.error(`Failed to send push notification to device ${device.deviceId}:`, error);
          }
        }
      }
    }
  }
}