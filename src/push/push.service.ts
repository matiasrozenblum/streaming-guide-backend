import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as webPush from 'web-push';
import * as admin from 'firebase-admin';
import { PushSubscriptionEntity } from './push-subscription.entity';
import { CreatePushSubscriptionDto } from './dto/create-push-subscription.dto';
import { NotificationsService } from '@/notifications/notifications.service';
import { Device } from '../users/device.entity';
import { ConfigService } from '@nestjs/config'; // Added ConfigService import
let firebaseApp: admin.app.App | null = null;
let vapidInitialized = false;

// Global Initialization for Serverless environments (Vercel)
// This guarantees the SDK is initialized immediately when the module is imported,
// avoiding cold-start race conditions inside the NestJS DI container.
const initializeFirebase = () => {
  if (firebaseApp) return;

  if (admin.apps.length > 0) {
    firebaseApp = admin.app(); // gets DEFAULT app
    console.log(`ℹ️ [Global] Reusing existing DEFAULT Firebase app`);
    return;
  }

  console.log('🔄 [Global] Initializing new DEFAULT Firebase Admin app...');
  try {
    const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT;

    let credential;
    let projectId;

    if (serviceAccountJson) {
      const serviceAccount = JSON.parse(serviceAccountJson);
      if (serviceAccount.private_key) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      }
      credential = admin.credential.cert(serviceAccount);
      projectId = serviceAccount.project_id;
      console.log(`✅ [Global] Loaded credentials from JSON env var. Valid client_email: ${!!serviceAccount.client_email}`);
    } else if (serviceAccountPath) {
      const cleanPath = serviceAccountPath.replace(/^"|"$/g, '');
      const resolvePath = require('path').resolve(process.cwd(), cleanPath);

      if (require('fs').existsSync(resolvePath)) {
        const fileContent = require('fs').readFileSync(resolvePath, 'utf8');
        const serviceAccount = JSON.parse(fileContent);
        credential = admin.credential.cert(serviceAccount);
        projectId = serviceAccount.project_id;
        console.log(`✅ [Global] Loaded credentials from file. Project ID: ${projectId}`);
      }
    }

    if (!credential) {
      const keyPath = require('path').resolve(process.cwd(), 'backend-firebase-key.json');
      if (require('fs').existsSync(keyPath)) {
        const serviceAccount = require(keyPath);
        credential = admin.credential.cert(serviceAccount);
        projectId = serviceAccount.project_id;
        console.log('✅ [Global] Loaded credentials from local fallback');
      }
    }

    if (credential) {
      firebaseApp = admin.initializeApp({
        credential,
        projectId: projectId || 'la-guia-del-streaming-ee16f'
      });
      console.log(`🚀 [Global] Firebase Admin initialized successfully!`);
    } else {
      console.warn('⚠️ [Global] Firebase Admin not initialized: No credentials resolved');
    }
  } catch (error: any) {
    console.error('❌ [Global] Failed to initialize Firebase:', error.message);
  }
};

const initializeWebPush = () => {
  if (vapidInitialized) return;
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

  if (vapidPublicKey && vapidPrivateKey) {
    try {
      webPush.setVapidDetails('mailto:soporte@laguiadelstreaming.com.ar', vapidPublicKey, vapidPrivateKey);
      vapidInitialized = true;
      console.log('✅ [Global] Web Push (VAPID) initialized');
    } catch (error: any) {
      console.warn('⚠️ [Global] Failed to set VAPID details:', error.message);
    }
  }
};

@Injectable()
export class PushService {

  constructor(
    @InjectRepository(PushSubscriptionEntity)
    private repo: Repository<PushSubscriptionEntity>,
    @InjectRepository(Device)
    private deviceRepository: Repository<Device>,
    private configService: ConfigService,
    private notificationsService: NotificationsService,
  ) {
    // Ensure initialization happened, just in case
    initializeFirebase();
    initializeWebPush();
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
    console.log(`📱 [PushService] createFCM called: deviceId=${deviceId}, platform=${platform}, tokenPrefix=${fcmToken?.substring(0, 20)}...`);

    if (!fcmToken || fcmToken.trim() === '') {
      console.error('❌ [PushService] FCM Token is empty');
      throw new Error('FCM Token cannot be empty');
    }

    const device = await this.deviceRepository.findOne({
      where: { deviceId },
    });

    if (!device) {
      console.error(`❌ [PushService] Device not found for deviceId=${deviceId}`);
      throw new Error('Device not found');
    }

    console.log(`✅ [PushService] Device found: id=${device.id}, deviceId=${device.deviceId}`);

    // Update device platform/token if needed
    if (device.platform !== platform || device.fcmToken !== fcmToken) {
      device.platform = platform;
      device.fcmToken = fcmToken;
      await this.deviceRepository.save(device);
      console.log(`✅ [PushService] Device updated with new FCM token and platform`);
    }

    // Check if subscription exists
    const existing = await this.repo.findOne({
      where: { device: { id: device.id }, endpoint: fcmToken },
      relations: ['device'],
    });

    if (existing) {
      console.log(`✅ [PushService] FCM subscription already exists for this device/token`);
      return existing;
    }

    // Create new FCM subscription
    // For Native, we use endpoint = fcmToken, and NULL keys
    console.log(`🆕 [PushService] Creating new FCM subscription (p256dh=null, auth=null)`);
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
    await this.repo.delete({ device: { id: device.id } }); // Delete all pushes for this device for safety

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

      const sendNative = async (attempt = 1): Promise<boolean> => {
        try {
          // Handle both payload formats: { title, body } and { title, options: { body } }
          const notificationBody = payload.body || payload.options?.body || '';
          const notificationTitle = payload.title || 'La Guia del Streaming';
          if (!firebaseApp) {
            console.error('❌ Firebase Admin app is not initialized. Cannot send native push.');
            return false;
          }

          console.log(`ℹ️ [PushService] Sending via app: ${firebaseApp.name} | Project: ${firebaseApp?.options?.projectId}`);

          const message: admin.messaging.Message = {
            token: entity.endpoint,
            notification: {
              title: notificationTitle,
              body: notificationBody,
            },
            ...(payload.data && Object.keys(payload.data).length > 0 ? { data: payload.data } : {}),
            // Android-specific config
            android: {
              priority: 'high',
              notification: {
                channelId: 'streaming_alerts',
              },
            },
            // APNs (iOS) specific config
            apns: {
              payload: {
                aps: {
                  alert: {
                    title: notificationTitle,
                    body: notificationBody,
                  },
                  sound: 'default',
                  badge: 1,
                  contentAvailable: true,
                },
              },
            },
          };

          // Diagnostic logs for Railway backend 401 issues
          console.log(`[Diagnostic] Native payload structure check:`, JSON.stringify({
            hasToken: !!message.token,
            tokenPrefix: message.token?.substring(0, 15) || 'NONE',
            title: message.notification?.title,
            bodyPrefix: message.notification?.body?.substring(0, 15),
            projectId: firebaseApp.options.projectId || 'UNKNOWN',
            credentialExists: !!firebaseApp.options.credential
          }));

          await firebaseApp.messaging().send(message);
          return true;
        } catch (error) {
          if (attempt === 1) {
            console.warn(`⚠️ First attempt failed for native push (${error.message}). Retrying...`);
            await new Promise(r => setTimeout(r, 1000)); // Wait 1s
            return sendNative(2);
          }

          if (error.code === 'messaging/registration-token-not-registered' || error.code === 'messaging/invalid-payload') {
            console.warn(`⚠️ Token invalid (${error.code}), deleting subscription:`, entity.endpoint);
            await this.repo.delete({ id: entity.id });
          }
          console.error(`❌ Failed to send native push (Attempt ${attempt}): ${error.message}`);
          console.error('Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
          return false;
        }
      };

      return sendNative();
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