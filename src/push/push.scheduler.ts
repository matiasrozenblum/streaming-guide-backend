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
import { EmailService } from '../email/email.service';
import { buildProgramNotificationHtml } from '../email/email.templates';
import { ConfigService } from '../config/config.service';
import { TimezoneUtil } from '../utils/timezone.util';
import { SchedulesService } from '../schedules/schedules.service';

dayjs.extend(utc);
dayjs.extend(timezone);

@Injectable()
export class PushScheduler {
  private readonly logger = new Logger(PushScheduler.name);

  constructor(
    private readonly pushService: PushService,
    private readonly emailService: EmailService,
    @InjectRepository(Schedule)
    private readonly scheduleRepo: Repository<Schedule>,
    @InjectRepository(UserSubscription)
    private readonly userSubscriptionRepo: Repository<UserSubscription>,
    @InjectRepository(PushSubscriptionEntity)
    private readonly subsRepo: Repository<PushSubscriptionEntity>,
    private readonly configService: ConfigService,
    private readonly schedulesService: SchedulesService,
  ) { }

  @Cron(CronExpression.EVERY_MINUTE, {
    timeZone: 'America/Argentina/Buenos_Aires',
  })
  async handleNotificationsCron() {
    // 1) Target = ahora + 10 minutos, sin segundos ni ms
    const now = TimezoneUtil.now();
    const target = now.add(10, 'minute').second(0).millisecond(0);
    const dayOfWeek = target.isBefore(now) ? target.add(1, 'day').format('dddd').toLowerCase() : target.format('dddd').toLowerCase();
    const timeString = target.format('HH:mm:ss');
    this.logger.log(`Buscando schedules para ${dayOfWeek} a las ${timeString}`);

    // 2) Obtener schedules usando el servicio (usa cache Redis de 30 min)
    const allSchedules = await this.schedulesService.findAll({
      dayOfWeek,
      applyOverrides: true,
      liveStatus: false,
      skipCache: false, // ✅ IMPORTANTE: Usar cache para reducir carga en DB
    });

    // Filtrar schedules que empiezan en 10 min
    const dueSchedules = allSchedules.filter(s => s.start_time === timeString);
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
        channelName: s.program.channel?.name,
        start_time: s.start_time,
        end_time: s.end_time,
      };
    }));

    // 3) IDs únicos de programas
    const programIds = Array.from(new Set(dueSchedules.map(s => s.program.id)));

    // 4) Traer subscripciones de usuarios para esos programas
    const allUserSubscriptions = await this.userSubscriptionRepo.find({
      where: {
        program: { id: In(programIds) },
        isActive: true,
      },
      relations: ['user', 'user.devices', 'user.devices.pushSubscriptions', 'program', 'program.channel'],
    });

    if (allUserSubscriptions.length === 0) {
      this.logger.debug('No hay subscripciones activas para estos programas.');
      return;
    }

    // 5) Enviar notificaciones por programa + usuario
    for (const schedule of dueSchedules) {
      const program = schedule.program;
      const title = program.name;
      const channelName = program.channel?.name || 'Canal desconocido';
      const channelHandle = program.channel?.handle;

      // Gating: skip notifications if channel is not fetchable (holiday/flag)
      if (channelHandle && !(await this.configService.canFetchLive(channelHandle))) {
        this.logger.log(`⏸️ Notificaciones suspendidas para canal ${channelHandle} por holiday/flag`);
        continue;
      }

      // subscripciones para este programa específico
      const programSubscriptions = allUserSubscriptions.filter(sub => sub.program.id === program.id);

      for (const subscription of programSubscriptions) {
        const user = subscription.user;
        const notificationMethod = subscription.notificationMethod;

        // Send push notifications
        if (notificationMethod === NotificationMethod.PUSH || notificationMethod === NotificationMethod.BOTH) {
          if (user.devices && user.devices.length > 0) {
            for (const device of user.devices) {
              if (device.pushSubscriptions && device.pushSubscriptions.length > 0) {
                for (const pushSub of device.pushSubscriptions) {
                  try {
                    const timeString = schedule.start_time.substring(0, 5); // "22:00"

                    await this.pushService.sendNotification(pushSub, {
                      title: `${title} en ${channelName}`,
                      body: `📺 Comienza a las ${timeString}. ¡En 10 minutos!`,
                      data: {
                        programId: program.id,
                        channelHandle: program.channel?.handle
                      },
                      options: {
                        icon: '/img/logo-192x192.png',
                      },
                    });
                    this.logger.log(`✅ Push notification enviada a usuario ${user.email} (device: ${device.deviceId}) para "${title}"`);
                  } catch (err) {
                    this.logger.error(`❌ Falló push notification a usuario ${user.email} (device: ${device.deviceId})`, err as any);
                  }
                }
              }
            }
          }
        }

        // Send email notifications
        if (notificationMethod === NotificationMethod.EMAIL || notificationMethod === NotificationMethod.BOTH) {
          try {
            const emailHtml = buildProgramNotificationHtml(
              program.name,
              channelName,
              schedule.start_time,
              schedule.end_time,
              program.description,
            );

            await this.emailService.sendEmail({
              to: user.email,
              subject: `¡${program.name} comienza en 10 minutos!`,
              html: emailHtml,
              emailType: 'program_notification',
            });

            this.logger.log(`✅ Email notification enviado a usuario ${user.email} para "${title}"`);
          } catch (err) {
            this.logger.error(`❌ Falló email notification a usuario ${user.email}`, err as any);
          }
        }
      }
    }
  }
}