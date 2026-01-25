import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as webPush from 'web-push';
import * as admin from 'firebase-admin';
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

    // Initialize Firebase Admin for Native Push
    if (!admin.apps.length) {
      try {
        const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
        const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

        if (serviceAccountJson) {
          // 1. Try initializing from JSON content (Env Var) - Best for Railway/Heroku
          admin.initializeApp({
            credential: admin.credential.cert(JSON.parse(serviceAccountJson)),
          });
          console.log('✅ Firebase Admin initialized from FIREBASE_SERVICE_ACCOUNT_JSON');
        } else if (serviceAccountPath) {
          // 2. Try initializing from File Path (Local Dev)
          if (require('fs').existsSync(serviceAccountPath)) {
            admin.initializeApp({
              credential: admin.credential.cert(require(serviceAccountPath)),
            });
            console.log('✅ Firebase Admin initialized from GOOGLE_APPLICATION_CREDENTIALS file');
          } else {
            console.warn(`⚠️ Credentials file not found at: ${serviceAccountPath}`);
          }
        } else {
          console.warn('⚠️ No Firebase credentials found (checked FIREBASE_SERVICE_ACCOUNT_JSON and GOOGLE_APPLICATION_CREDENTIALS) - native push will not work');
        }
      } catch (error) {
        console.warn('⚠️ Failed to initialize Firebase Admin:', error.message);
      }
    }
  }

  async create(dto: CreatePushSubscriptionDto) {
    const { deviceId, subscription } = dto;
    const endpoint = subscription.endpoint;

    if (!endpoint || endpoint.trim() === '') {
      throw new Error('Endpoint cannot be empty');
    }

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
      p256dh: subscription.keys?.p256dh || null,
      auth: subscription.keys?.auth || null,
    });
    return this.repo.save(sub);
  }

  async sendNotification(entity: PushSubscriptionEntity, payload: any) {
    if (!entity.p256dh || !entity.auth) {
      // Native Push (Firebase)
      console.log('🔥 Sending NATIVE push notification to device', entity.device?.deviceId || 'unknown');
      try {
        await admin.messaging().send({
          token: entity.endpoint, // Endpoint stores the FCM token for native
          notification: {
            title: payload.title,
            body: payload.body,
          },
          data: payload.data || {},
        });
      } catch (error) {
        if (!entity.endpoint) {
          console.error('❌ CRITICAL: Attempting to send Native Push with EMPTY or NULL endpoint!', JSON.stringify(entity));
        }
        if (error.code === 'messaging/registration-token-not-registered') {
          console.warn('⚠️ Token invalid, deleting subscription:', entity.endpoint);
          await this.repo.delete({ id: entity.id });
        }
        throw error;
      }
      return;
    }

    // Web Push
    console.log('🔥 Sending WEB push notification to device', entity.device?.deviceId || 'unknown');
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