import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Repository } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { Channel } from '../channels/channels.entity';
import { Program } from '../programs/programs.entity';
import { Schedule } from '../schedules/schedules.entity';
import { ProposedChangesService } from '../proposed-changes/proposed-changes.service';
import { EmailService } from '../email/email.service';
import { scrapeVorterixSchedule, VorterixProgram } from './vorterix.scraper';
import { scrapeGelatinaSchedule, GelatinaProgram } from './gelatina.scraper';
import { scrapeUrbanaPlaySchedule, UrbanaProgram } from './urbana.scraper';

@Injectable()
export class ScraperService {
  constructor(
    @InjectRepository(Channel)
    private readonly channelRepo: Repository<Channel>,
    @InjectRepository(Program)
    private readonly programRepo: Repository<Program>,
    @InjectRepository(Schedule)
    private readonly scheduleRepo: Repository<Schedule>,
    private readonly proposedChangesService: ProposedChangesService,
    private readonly emailService: EmailService,
  ) {}

  @Cron(CronExpression.EVERY_WEEK)
  async handleWeeklyVorterixUpdate() {
    console.log('⏰ Ejecutando actualización semanal de Vorterix...');
    await this.insertVorterixSchedule();
    console.log('✅ Actualización semanal de Vorterix completada');
  }

  @Cron(CronExpression.EVERY_WEEK)
  async handleWeeklyGelatinaUpdate() {
    console.log('⏰ Ejecutando actualización semanal de Gelatina...');
    await this.insertGelatinaSchedule();
    console.log('✅ Actualización semanal de Gelatina completada');
  }

  @Cron(CronExpression.EVERY_WEEK)
  async handleWeeklyUrbanaUpdate() {
    console.log('⏰ Ejecutando actualización semanal de Urbana Play...');
    await this.insertUrbanaSchedule();
    console.log('✅ Actualización semanal de Urbana completada');
  }

  private async insertSchedule(scrapedData: any[], channelName: string) {
    const changes: Array<{
      entityType: 'program' | 'schedule';
      action: 'create' | 'update';
      channelName: string;
      programName: string;
      before: any;
      after: any;
    }> = [];

    let channel = await this.channelRepo.findOne({ where: { name: channelName } });
    if (!channel) {
      channel = this.channelRepo.create({ name: channelName });
      await this.channelRepo.save(channel);
    }

    await this.proposedChangesService.clearPendingChangesForChannel(channel.name);

    for (const item of scrapedData) {
      let program = await this.programRepo.findOne({
        where: { name: item.name, channel: { id: channel.id } },
        relations: ['channel'],
      });

      if (!program) {
        changes.push({
          entityType: 'program',
          action: 'create',
          channelName: channel.name,
          programName: item.name,
          before: null,
          after: {
            name: item.name,
            channelId: channel.id,
            logo_url: item.logoUrl || null,
          },
        });
      }

      for (const day of item.days) {
        const dayLower = this.translateDay(day);

        const existingSchedule = await this.scheduleRepo.findOne({
          where: { program: { id: program?.id || -1 }, day_of_week: dayLower },
          relations: ['program'],
        });

        const startTimeNormalized = this.normalizeTime(item.startTime);
        const endTimeNormalized = this.normalizeTime(item.endTime);

        if (!existingSchedule) {
          changes.push({
            entityType: 'schedule',
            action: 'create',
            channelName: channel.name,
            programName: item.name,
            before: null,
            after: {
              day_of_week: dayLower,
              start_time: startTimeNormalized,
              end_time: endTimeNormalized,
            },
          });
        } else {
          const dbStartTime = this.normalizeTime(existingSchedule.start_time);
          const dbEndTime = this.normalizeTime(existingSchedule.end_time);

          const startMatches = dbStartTime === startTimeNormalized;
          const endMatches = dbEndTime === endTimeNormalized;

          if (!startMatches || !endMatches) {
            changes.push({
              entityType: 'schedule',
              action: 'update',
              channelName: channel.name,
              programName: item.name,
              before: {
                day_of_week: existingSchedule.day_of_week,
                start_time: dbStartTime,
                end_time: dbEndTime,
              },
              after: {
                day_of_week: dayLower,
                start_time: startTimeNormalized,
                end_time: endTimeNormalized,
              },
            });
          }
        }
      }
    }

    if (changes.length > 0) {
      await this.proposedChangesService.createProposedChange(changes);
    }

    await this.sendReportEmail();
    return { success: true };
  }

  async insertVorterixSchedule() {
    const data: VorterixProgram[] = await scrapeVorterixSchedule();
    return this.insertSchedule(data, 'Vorterix');
  }

  async insertGelatinaSchedule() {
    const data: GelatinaProgram[] = await scrapeGelatinaSchedule();
    return this.insertSchedule(data, 'Gelatina');
  }

  async insertUrbanaSchedule() {
    const data: UrbanaProgram[] = await scrapeUrbanaPlaySchedule();
    return this.insertSchedule(data, 'Urbana Play');
  }

  private translateDay(day: string): string {
    const translations: Record<string, string> = {
      lunes: 'monday',
      martes: 'tuesday',
      miércoles: 'wednesday',
      miercoles: 'wednesday',
      jueves: 'thursday',
      viernes: 'friday',
      sábado: 'saturday',
      sabado: 'saturday',
      domingo: 'sunday',
    };
    return translations[day.toLowerCase()] || day.toLowerCase();
  }

  private normalizeTime(time?: string): string {
    if (!time) return '';
    
    const parts = time.split(':');

    if (parts.length >= 2) {
      return `${parts[0]}:${parts[1].padStart(2, '0')}`;
    }

    if (parts.length === 1) {
      return `${parts[0]}:00`;
    }

    return time;
  }

  private async sendReportEmail() {
    const pendingChanges = await this.proposedChangesService.getPendingChanges();
    if (pendingChanges.length) {
      await this.emailService.sendProposedChangesReport(pendingChanges);
    }
  }
}
