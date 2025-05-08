import { Injectable, Logger }       from '@nestjs/common';
import { Cron, CronExpression }     from '@nestjs/schedule';
import { InjectRepository }         from '@nestjs/typeorm';
import { Repository }               from 'typeorm';
import dayjs                        from 'dayjs';
import utc                          from 'dayjs/plugin/utc';
import timezone                     from 'dayjs/plugin/timezone';

import { Schedule }                      from '../schedules/schedules.entity';
import { NotificationPreferenceEntity }  from '../notifications/notification-preference.entity';
import { PushSubscriptionEntity }        from './push-subscription.entity';
import { PushService }                   from './push.service';

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

  /**
   * Cada minuto, a la hora exacta:
   *   1) Calcula "ahora + 10 minutos" (redondeado al minuto),
   *   2) Busca schedules con day_of_week y start_time iguales,
   *   3) Filtra por preferencias,
   *   4) Envía las push.
   */
  @Cron(CronExpression.EVERY_MINUTE, {
    timeZone: 'America/Argentina/Buenos_Aires', // tu huso
  })
  async handleNotificationsCron() {
    // 1) Calculamos target = ahora + 10 minutos, sin segundos ni ms
    const now    = dayjs().tz('America/Argentina/Buenos_Aires');
    const target = now.add(10, 'minute').second(0).millisecond(0);

    const dayOfWeek  = target.format('dddd').toLowerCase(); // "monday", "tuesday", etc.
    const timeString = target.format('HH:mm:ss');           // "13:00:00"

    this.logger.log(`Buscando schedules para ${dayOfWeek} a las ${timeString}`);

    // 2) Obtener schedules activos
    const dueSchedules = await this.scheduleRepo
      .createQueryBuilder('s')
      .innerJoinAndSelect('s.program', 'program')
      .where('s.day_of_week = :dow', { dow: dayOfWeek })
      .andWhere('s.start_time = :time', { time: timeString })
      .getMany();

    if (dueSchedules.length === 0) {
      this.logger.debug('Ningún programa coincide.');
      return;
    }

    // 3) IDs únicos de programas
    const programIds = Array.from(new Set(dueSchedules.map((s) => s.program.id)));

    // 4) Traer preferencias sólo para esos programas
    const prefs = await this.prefsRepo.find({
      where: programIds.map((pid) => ({ programId: pid })),
    });
    if (prefs.length === 0) {
      this.logger.debug('No hay preferencias para estos programas.');
      return;
    }

    // 5) Enviar push a cada deviceId suscripto
    for (const { programId, deviceId } of prefs) {
      // Encontrar el schedule correspondiente
      const schedule = dueSchedules.find((s) => s.program.id === programId)!;
      const title    = schedule.program.name;

      // Todas las subscripciones para ese device
      const subs = await this.subsRepo.find({ where: { deviceId } });

      for (const sub of subs) {
        try {
          await this.pushService.sendNotification(sub, {
            title,
            options: {
              body: `¡En 10 minutos comienza ${title}!`,
              icon: '/img/logo-192x192.png',   // tu logo en /public/img
              badge: '/img/badge-72x72.png',   // opcional
            },
          });
          this.logger.log(`✅ Notificación enviada a ${deviceId} para "${title}"`);
        } catch (err) {
          this.logger.error(`❌ Falló notificar a ${deviceId}`, err);
        }
      }
    }
  }
}