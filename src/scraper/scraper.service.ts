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

        const startTime = (item.startTime || '').replace('.', ':');
        const endTime = (item.endTime || '').replace('.', ':');

        if (!existingSchedule) {
          changes.push({
            entityType: 'schedule',
            action: 'create',
            channelName: channel.name,
            programName: item.name,
            before: null,
            after: {
              day_of_week: dayLower,
              start_time: startTime,
              end_time: endTime,
            },
          });
        } else {
          const startMatches = this.normalizeTime(existingSchedule.start_time) === this.normalizeTime(item.startTime);
          const endMatches = this.normalizeTime(existingSchedule.end_time) === this.normalizeTime(item.endTime);

          if (!startMatches || !endMatches) {
            changes.push({
              entityType: 'schedule',
              action: 'update',
              channelName: channel.name,
              programName: item.name,
              before: {
                day_of_week: existingSchedule.day_of_week,
                start_time: existingSchedule.start_time,
                end_time: existingSchedule.end_time,
              },
              after: {
                day_of_week: dayLower,
                start_time: startTime,
                end_time: endTime,
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

  private async sendReportEmail() {
    const pendingChanges = await this.proposedChangesService.getPendingChanges();
    if (pendingChanges.length) {
      await this.emailService.sendProposedChangesReport(pendingChanges);
    }
  }

  private normalizeTime(time?: string): string {
    if (!time) return '';
  
    const [hours, minutes] = time.split(':');
  
    if (minutes === undefined) {
      return `${hours}:00`; // ejemplo: "10" -> "10:00"
    }
  
    // Si venía con segundos (HH:MM:SS), ignorarlos
    return `${hours}:${minutes.padEnd(2, '0')}`; // ejemplo: "10:00:00" -> "10:00"
  }
}
