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
    // Initialize Firebase Admin SDK
    if (admin.apps.length === 0) {
      try {
        // Option 1: JSON string in env var (recommended for cloud platforms like Railway)
        const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT;
        // Option 2: File path in env var
        const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

        if (serviceAccountJson) {
          const serviceAccount = JSON.parse(serviceAccountJson);
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
          });
          console.log('✅ Firebase Admin initialized with FIREBASE_SERVICE_ACCOUNT');
        } else if (serviceAccountPath) {
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccountPath),
          });
          console.log('✅ Firebase Admin initialized with GOOGLE_APPLICATION_CREDENTIALS');
        } else {
          // Fallback: local key file (dev only)
          const keyPath = require('path').resolve(process.cwd(), 'backend-firebase-key.json');
          if (require('fs').existsSync(keyPath)) {
            admin.initializeApp({
              credential: admin.credential.cert(require(keyPath)),
            });
            console.log('✅ Firebase Admin initialized with backend-firebase-key.json');
          } else {
            console.warn('⚠️ Firebase Admin not initialized: No credentials found');
          }
        }
      } catch (error) {
        console.error('❌ Failed to initialize Firebase Admin:', error.message);
      }
    }

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
      console.warn('⚠️ VAPID keys not configured - web push notifications will not work');
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

  // Method to handle Native FCM Subscriptions
  async createFCM(deviceId: string, fcmToken: string, platform: 'ios' | 'android' | 'web') {
    if (!fcmToken || fcmToken.trim() === '') {
      throw new Error('FCM Token cannot be empty');
    }

    const device = await this.deviceRepository.findOne({
      where: { deviceId },
    });

    if (!device) {
      throw new Error('Device not found');
    }

    // Update device platform/token if needed
    if (device.platform !== platform || device.fcmToken !== fcmToken) {
      device.platform = platform;
      device.fcmToken = fcmToken;
      await this.deviceRepository.save(device);
    }

    // Check if subscription exists
    const existing = await this.repo.findOne({
      where: { device: { id: device.id }, endpoint: fcmToken },
      relations: ['device'],
    });

    if (existing) {
      return existing;
    }

    // Create new FCM subscription
    // For Native, we use endpoint = fcmToken, and NULL keys
    const sub = this.repo.create({
      device,
      endpoint: fcmToken,
      p256dh: null,
      auth: null,
    });
    return this.repo.save(sub);
  }

  async unsubscribeFCM(deviceId: string) {
    const device = await this.deviceRepository.findOne({ where: { deviceId } });
    if (!device) return;

    // Remove subscriptions for this device that are FCM (null keys)
    // Actually we should probably remove by endpoint if provided, but typically unsubscribe is for the device.
    // Or maybe we just clear the fcmToken from device and remove subs?
    // Spec says POST /push/fcm/unsubscribe with deviceId.

    await this.repo.delete({ device: { id: device.id } }); // Delete all pus subs for this device? Or just native?
    // For safety let's delete only those with null keys if we want to be specific, but usually a device has one active token.
    // Let's just delete all for safety as a full unsubscribe.

    device.fcmToken = null;
    await this.deviceRepository.save(device);
    return { success: true };
  }

  async sendNotification(entity: PushSubscriptionEntity, payload: any): Promise<boolean> {
    // Validate integrity - Endpoint is mandatory for BOTH Native and Web
    if (!entity.endpoint || entity.endpoint.trim() === '') {
      console.warn(`⚠️ Subscription ${entity.id} has no endpoint. Deleting...`);
      await this.repo.delete({ id: entity.id });
      return false;
    }

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
        return true;
      } catch (error) {
        if (error.code === 'messaging/registration-token-not-registered' || error.code === 'messaging/invalid-payload') {
          console.warn(`⚠️ Token invalid (${error.code}), deleting subscription:`, entity.endpoint);
          await this.repo.delete({ id: entity.id });
        }
        console.error(`❌ Failed to send native push: ${error.message}`);
        return false;
      }
    }

    // Web Push
    console.log('🔥 Sending WEB push notification to device', entity.device?.deviceId || 'unknown');
    const pushSub = {
      endpoint: entity.endpoint,
      keys: { p256dh: entity.p256dh!, auth: entity.auth! },
    };
    try {
      await webPush.sendNotification(pushSub, JSON.stringify(payload));
      return true;
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        console.log('Subscription has expired or is no longer valid:', error.statusCode);
        await this.repo.delete({ id: entity.id });
        return false;
      }
      console.error(`❌ Failed to send web push: ${error.message}`);
      return false;
    }
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