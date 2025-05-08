import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as webPush from 'web-push';
import { PushSubscriptionEntity } from './push-subscription.entity';
import { CreatePushSubscriptionDto } from './dto/create-push-subscription.dto';
import { NotificationsService } from '@/notifications/notifications.service';

@Injectable()
export class PushService {
  constructor(
    @InjectRepository(PushSubscriptionEntity)
    private repo: Repository<PushSubscriptionEntity>,

    private notificationsService: NotificationsService,
  ) {
    webPush.setVapidDetails(
      'mailto:laguiadelstreaming@gmail.com',
      process.env.VAPID_PUBLIC_KEY || '',
      process.env.VAPID_PRIVATE_KEY || '',
    );
    console.log('🔥 VAPID_PUBLIC_KEY', process.env.VAPID_PUBLIC_KEY);
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
    console.log('🔥 Scheduling push for', title, `in ${inMinutes}m`);
    const delay = inMinutes * 60_000;
    setTimeout(async () => {
      // 1) Recuperar sólo las subscripciones de quienes quieren notificar ese programa
      const prefs = await this.notificationsService.list(programId);
      const subs = await this.repo.find({
        where: prefs.map(p => ({ deviceId: p.deviceId })),
      });
  
      subs.forEach(s =>
        this.sendNotification(s, {
          title,
          options: { body: `En ${inMinutes} minutos comienza ${title}` },
        }),
      );
    }, delay);
  }
}