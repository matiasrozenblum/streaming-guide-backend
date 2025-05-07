import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as webPush from 'web-push';
import { PushSubscriptionEntity } from './push-subscription.entity';
import { CreatePushSubscriptionDto } from './dto/create-push-subscription.dto';

@Injectable()
export class PushService {
  constructor(
    @InjectRepository(PushSubscriptionEntity)
    private repo: Repository<PushSubscriptionEntity>,
  ) {
    webPush.setVapidDetails(
      'mailto:tu@correo.com',
      process.env.VAPID_PUBLIC_KEY || '',
      process.env.VAPID_PRIVATE_KEY || '',
    );
  }

  async create(dto: CreatePushSubscriptionDto) {
    const sub = this.repo.create({
      deviceId: dto.deviceId,
      endpoint: dto.subscription.endpoint,
      p256dh: dto.subscription.keys.p256dh,
      auth: dto.subscription.keys.auth,
    });
    return this.repo.save(sub);
  }

  async sendNotification(entity: PushSubscriptionEntity, payload: any) {
    console.log('🔥 Sending push notification to', entity.deviceId);
    const pushSub = {
      endpoint: entity.endpoint,
      keys: { p256dh: entity.p256dh, auth: entity.auth },
    };
    return webPush.sendNotification(pushSub, JSON.stringify(payload));
  }

  async scheduleForProgram(programId: string, title: string, inMinutes: number) {
    console.log('🔥 Scheduling push notification for', title);
    // Ejemplo simple con setTimeout, pero en prod usarías un job/cron
    const target = Date.now() + inMinutes * 60_000;
    const subs = await this.repo.find();
    setTimeout(() => {
      subs.forEach((s) =>
        this.sendNotification(s, {
          title,
          options: { body: `En 10 minutos comienza ${title}` },
        }),
      );
    }, target - Date.now());
  }
}