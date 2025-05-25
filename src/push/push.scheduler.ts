import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';

import { Schedule } from '../schedules/schedules.entity';
import { UserSubscription, NotificationMethod } from '../users/user-subscription.entity';
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
    @InjectRepository(UserSubscription)
    private readonly userSubscriptionRepo: Repository<UserSubscription>,
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
    const dayOfWeek = target.isBefore(now) ? target.add(1, 'day').format('dddd').toLowerCase() : target.format('dddd').toLowerCase();
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
    this.logger.log(`Encontrados ${dueSchedules.length} programas que coinciden.`);
    this.logger.log(dueSchedules.map(s => {
      return {
        id: s.id,
        programId: s.program.id,
        programName: s.program.name,
        start_time: s.start_time,
        end_time: s.end_time,
      };
    }));

    // 3) IDs únicos de programas
    const programIds = Array.from(new Set(dueSchedules.map(s => s.program.id)));

    // 4) Traer subscripciones de usuarios para esos programas (que incluyan push notifications)
    const userSubscriptions = await this.userSubscriptionRepo.find({
      where: { 
        program: { id: In(programIds) },
        isActive: true,
        notificationMethod: In([NotificationMethod.PUSH, NotificationMethod.BOTH])
      },
      relations: ['user', 'user.devices', 'user.devices.pushSubscriptions', 'program'],
    });

    if (userSubscriptions.length === 0) {
      this.logger.debug('No hay subscripciones activas para estos programas.');
      return;
    }

    // 5) Enviar notificaciones por programa + usuario
    for (const schedule of dueSchedules) {
      const title = schedule.program.name;
      // subscripciones para este programa específico
      const programSubscriptions = userSubscriptions.filter(sub => sub.program.id === schedule.program.id);
      
      for (const subscription of programSubscriptions) {
        const user = subscription.user;
        if (user.devices && user.devices.length > 0) {
          for (const device of user.devices) {
            if (device.pushSubscriptions && device.pushSubscriptions.length > 0) {
              for (const pushSub of device.pushSubscriptions) {
                try {
                  await this.pushService.sendNotification(pushSub, {
                    title,
                    options: {
                      body: `¡En 10 minutos comienza ${title}!`, 
                      icon: '/img/logo-192x192.png',
                    },
                  });
                  this.logger.log(`✅ Notificación enviada a usuario ${user.email} (device: ${device.deviceId}) para "${title}"`);
                } catch (err) {
                  this.logger.error(`❌ Falló notificar a usuario ${user.email} (device: ${device.deviceId})`, err as any);
                }
              }
            }
          }
        }
      }
    }
  }
}