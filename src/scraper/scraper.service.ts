import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Repository } from 'typeorm';
import { Channel } from '../channels/channels.entity';
import { Program } from '../programs/programs.entity';
import { Schedule } from '../schedules/schedules.entity';
import { VorterixProgram, scrapeVorterixSchedule } from './vorterix.scraper';
import { scrapeGelatinaSchedule, GelatinaProgram } from './gelatina.scraper';
import { scrapeUrbanaPlaySchedule, UrbanaProgram } from './urbana.scraper';
import { Injectable } from '@nestjs/common';
import { ProposedChangesService } from '../proposed-changes/proposed-changes.service';
import { EmailService } from '../email/email.service'; // << Agregado

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

  async insertVorterixSchedule() {
    const data: VorterixProgram[] = await scrapeVorterixSchedule();
    const channelName = 'Vorterix';

    let channel = await this.channelRepo.findOne({ where: { name: channelName } });
    if (!channel) {
      channel = this.channelRepo.create({ name: channelName });
      await this.channelRepo.save(channel);
    }

    for (const item of data) {
      let program = await this.programRepo.findOne({
        where: { name: item.name, channel: { id: channel.id } },
        relations: ['channel'],
      });

      if (!program) {
        await this.proposedChangesService.createProposedChange({
          entityType: 'program',
          action: 'create',
          channelName: channel.name,
          programName: item.name,
          before: null,
          after: {
            name: item.name,
            channelId: channel.id,
            logo_url: null,
          },
        });
      }

      for (const day of item.days) {
        const dayLower = this.translateDay(day);
        const existingSchedule = await this.scheduleRepo.findOne({
          where: { program: { id: program?.id || -1 }, day_of_week: dayLower },
          relations: ['program'],
        });

        if (!existingSchedule) {
          await this.proposedChangesService.createProposedChange({
            entityType: 'schedule',
            action: 'create',
            channelName: channel.name,
            programName: item.name,
            before: null,
            after: {
              day_of_week: dayLower,
              start_time: item.startTime,
              end_time: item.endTime,
            },
          });
        }
      }
    }

    await this.sendReportEmail(); // << Agregado

    return { success: true };
  }

  async insertGelatinaSchedule() {
    const data: GelatinaProgram[] = await scrapeGelatinaSchedule();
    const channelName = 'Gelatina';

    let channel = await this.channelRepo.findOne({ where: { name: channelName } });
    if (!channel) {
      channel = this.channelRepo.create({
        name: channelName,
        logo_url: 'https://gelatina.com.ar/wp-content/uploads/2025/02/Gelatina-2025.png',
      });
      await this.channelRepo.save(channel);
    }

    for (const item of data) {
      let program = await this.programRepo.findOne({
        where: { name: item.name, channel: { id: channel.id } },
        relations: ['channel'],
      });

      if (!program) {
        await this.proposedChangesService.createProposedChange({
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
        const exists = await this.scheduleRepo.findOne({
          where: { program: { id: program?.id || -1 }, day_of_week: dayLower },
          relations: ['program'],
        });

        if (!exists) {
          await this.proposedChangesService.createProposedChange({
            entityType: 'schedule',
            action: 'create',
            channelName: channel.name,
            programName: item.name,
            before: null,
            after: {
              day_of_week: dayLower,
              start_time: item.startTime,
              end_time: item.endTime,
            },
          });
        }
      }
    }

    await this.sendReportEmail(); // << Agregado

    return { success: true };
  }

  async insertUrbanaSchedule() {
    const data: UrbanaProgram[] = await scrapeUrbanaPlaySchedule();
    const channelName = 'Urbana Play';

    let channel = await this.channelRepo.findOne({ where: { name: channelName } });
    if (!channel) {
      channel = this.channelRepo.create({
        name: channelName,
        logo_url: 'https://urbanaplayfm.com/wp-content/uploads/2021/03/LOGO-URBANA-play-nuevo.png',
      });
      await this.channelRepo.save(channel);
    }

    for (const item of data) {
      let program = await this.programRepo.findOne({
        where: { name: item.name, channel: { id: channel.id } },
        relations: ['channel'],
      });

      if (!program) {
        await this.proposedChangesService.createProposedChange({
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
        const exists = await this.scheduleRepo.findOne({
          where: { program: { id: program?.id || -1 }, day_of_week: dayLower },
          relations: ['program'],
        });

        if (!exists) {
          await this.proposedChangesService.createProposedChange({
            entityType: 'schedule',
            action: 'create',
            channelName: channel.name,
            programName: item.name,
            before: null,
            after: {
              day_of_week: dayLower,
              start_time: item.startTime.replace('.', ':'),
              end_time: item.endTime.replace('.', ':'),
            },
          });
        }
      }
    }

    await this.sendReportEmail(); // << Agregado

    return { success: true };
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
    await this.emailService.sendProposedChangesReport(pendingChanges);
  }
}
