import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';

import { Schedule } from '../schedules/schedules.entity';
import { NotificationPreferenceEntity } from '../notifications/notification-preference.entity';
import { PushSubscriptionEntity } from './push-subscription.entity';
import { PushService } from './push.service';

dayjs.extend(utc);
dayjs.extend(timezone);

@Injectable()
export class PushScheduler {
  private readonly logger = new Logger(PushScheduler.name);

  constructor(
    private readonly pushService: PushService,
    @InjectRepository(Schedule)
    private readonly scheduleRepo: Repository<Schedule>,
    @InjectRepository(NotificationPreferenceEntity)
    private readonly prefsRepo: Repository<NotificationPreferenceEntity>,
    @InjectRepository(PushSubscriptionEntity)
    private readonly subsRepo: Repository<PushSubscriptionEntity>,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, {
    timeZone: 'America/Argentina/Buenos_Aires',
  })
  async handleNotificationsCron() {
    // 1) Target = ahora + 10 minutos, sin segundos ni ms
    const now = dayjs().tz('America/Argentina/Buenos_Aires');
    const target = now.add(10, 'minute').second(0).millisecond(0);
    const dayOfWeek = target.format('dddd').toLowerCase();
    const timeString = target.format('HH:mm:ss');

    this.logger.log(`Buscando schedules para ${dayOfWeek} a las ${timeString}`);

    // 2) Obtener schedules que empiezan en 10 min
    const dueSchedules = await this.scheduleRepo.find({
      where: { day_of_week: dayOfWeek, start_time: timeString },
      relations: ['program'],
    });
    if (dueSchedules.length === 0) {
      this.logger.debug('Ningún programa coincide.');
      return;
    }

    // 3) IDs únicos de programas
    const programIds = Array.from(new Set(dueSchedules.map(s => s.program.id)));

    // 4) Traer preferencias sólo para esos programas
    const prefs = await this.prefsRepo.find({ where: { programId: In(programIds) } });
    if (prefs.length === 0) {
      this.logger.debug('No hay preferencias para estos programas.');
      return;
    }

    // 5) Traer todas las subscripciones de los deviceId implicados
    const deviceIds = Array.from(new Set(prefs.map(p => p.deviceId)));
    const allSubs = await this.subsRepo.find({ where: { deviceId: In(deviceIds) } });
    if (allSubs.length === 0) {
      this.logger.debug('No hay subscripciones de push para esos dispositivos.');
      return;
    }

    // 6) Enviar notificaciones por programa + dispositivo
    for (const schedule of dueSchedules) {
      const title = schedule.program.name;
      // dispositivos que pidieron este programa
      const programPrefs = prefs.filter(p => p.programId === schedule.program.id);
      for (const { deviceId } of programPrefs) {
        const subs = allSubs.filter(s => s.deviceId === deviceId);
        for (const sub of subs) {
          try {
            await this.pushService.sendNotification(sub, {
              title,
              options: {
                body: `¡En 10 minutos comienza ${title}!`, 
                icon: '/img/logo-192x192.png',
              },
            });
            this.logger.log(`✅ Notificación enviada a ${deviceId} para "${title}"`);
          } catch (err) {
            this.logger.error(`❌ Falló notificar a ${deviceId}`, err as any);
          }
        }
      }
    }
  }
}