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

  // Single consolidated cron job that runs all scrapers and sends one email
  @Cron(CronExpression.EVERY_WEEK)
  async handleWeeklyScrapersUpdate() {
    console.log('⏰ Ejecutando actualización semanal de todos los canales...');
    
    const results = await Promise.allSettled([
      this.insertVorterixSchedule(false), // Don't send individual emails
      this.insertGelatinaSchedule(false),
      this.insertUrbanaSchedule(false),
    ]);

    // Log results for each scraper
    results.forEach((result, index) => {
      const channelName = ['Vorterix', 'Gelatina', 'Urbana Play'][index];
      if (result.status === 'fulfilled') {
        console.log(`✅ Actualización de ${channelName} completada`);
      } else {
        console.error(`❌ Error en actualización de ${channelName}:`, result.reason);
      }
    });

    // Send consolidated email report
    await this.sendConsolidatedReportEmail();
    console.log('✅ Actualización semanal consolidada completada');
  }

  // Helper method to normalize program names for comparison (removes accents and normalizes case)
  private normalizeStringForComparison(str: string): string {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  // Helper method to check if two times are equivalent (handles 23:59 vs 00:00 case)
  private areTimesEquivalent(time1: string, time2: string): boolean {
    const normalizedTime1 = this.normalizeTime(time1);
    const normalizedTime2 = this.normalizeTime(time2);
    
    // Direct match
    if (normalizedTime1 === normalizedTime2) {
      return true;
    }
    
    // Handle 23:59 vs 00:00 equivalence (for end times that cross midnight)
    if ((normalizedTime1 === '23:59' && normalizedTime2 === '00:00') ||
        (normalizedTime1 === '00:00' && normalizedTime2 === '23:59')) {
      return true;
    }
    
    return false;
  }

  private async insertSchedule(scrapedData: any[], channelName: string, sendEmail: boolean = true) {
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
      // Find program using normalized name comparison
      const normalizedScrapedName = this.normalizeStringForComparison(item.name);
      const existingPrograms = await this.programRepo.find({
        where: { channel: { id: channel.id } },
        relations: ['channel'],
      });

      let program = existingPrograms.find(p => 
        this.normalizeStringForComparison(p.name) === normalizedScrapedName
      );

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

          const startMatches = this.areTimesEquivalent(dbStartTime, startTimeNormalized);
          const endMatches = this.areTimesEquivalent(dbEndTime, endTimeNormalized);

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

    // Only send email if explicitly requested (for individual scraper runs)
    if (sendEmail) {
      await this.sendReportEmail();
    }
    
    return { success: true };
  }

  async insertVorterixSchedule(sendEmail: boolean = true) {
    const data: VorterixProgram[] = await scrapeVorterixSchedule();
    return this.insertSchedule(data, 'Vorterix', sendEmail);
  }

  async insertGelatinaSchedule(sendEmail: boolean = true) {
    const data: GelatinaProgram[] = await scrapeGelatinaSchedule();
    return this.insertSchedule(data, 'Gelatina', sendEmail);
  }

  async insertUrbanaSchedule(sendEmail: boolean = true) {
    const data: UrbanaProgram[] = await scrapeUrbanaPlaySchedule();
    return this.insertSchedule(data, 'Urbana Play', sendEmail);
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
    
    // Remove any extra whitespace
    time = time.trim();
    
    // Handle different time formats
    // If it's already in HH:MM:SS format, convert to HH:MM
    if (time.includes(':')) {
      const parts = time.split(':');
      if (parts.length >= 2) {
        const hours = parts[0].padStart(2, '0');
        const minutes = parts[1].padStart(2, '0');
        return `${hours}:${minutes}`;
      }
    }
    
    // If it's just a number (like "16"), convert to "16:00"
    if (/^\d+$/.test(time)) {
      return `${time.padStart(2, '0')}:00`;
    }
    
    // If it's in format like "16h" or "16 h", extract the number
    const hourMatch = time.match(/^(\d+)h?$/i);
    if (hourMatch) {
      return `${hourMatch[1].padStart(2, '0')}:00`;
    }
    
    // Return as-is if we can't parse it
    return time;
  }

  private async sendReportEmail() {
    const pendingChanges = await this.proposedChangesService.getPendingChanges();
    if (pendingChanges.length) {
      await this.emailService.sendProposedChangesReport(pendingChanges);
    }
  }

  private async sendConsolidatedReportEmail() {
    const pendingChanges = await this.proposedChangesService.getPendingChanges();
    if (pendingChanges.length) {
      await this.emailService.sendProposedChangesReport(pendingChanges);
    }
  }
}
