import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/users.entity';
import { UserSubscription } from '../users/user-subscription.entity';
import { Program } from '../programs/programs.entity';
import { Channel } from '../channels/channels.entity';
import { EmailService } from '../email/email.service';
import { ReportsProxyService } from './reports-proxy.service';
import { ReportType, ReportPeriod, ReportFormat, ReportAction } from './dto/report.dto';
import * as dayjs from 'dayjs';

@Injectable()
export class ComprehensiveReportService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(UserSubscription)
    private subscriptionRepository: Repository<UserSubscription>,
    @InjectRepository(Program)
    private programRepository: Repository<Program>,
    @InjectRepository(Channel)
    private channelRepository: Repository<Channel>,
    private emailService: EmailService,
    private reportsProxyService: ReportsProxyService,
  ) {}

  /**
   * Generate reports per channel
   */
  async generateChannelReport(
    channelId: number,
    from: string,
    to: string,
    format: ReportFormat,
    action: ReportAction,
    toEmail?: string,
  ) {
    const channel = await this.channelRepository.findOne({ where: { id: channelId } });
    if (!channel) {
      throw new Error('Channel not found');
    }

    const reportParams = {
      type: ReportType.CHANNEL_SUMMARY,
      format,
      from,
      to,
      channelId,
      action,
      toEmail,
    };

    if (action === ReportAction.TABLE) {
      return this.getChannelDataTable(channelId, from, to);
    }

    const file = await this.reportsProxyService.generateReport(reportParams);
    const filename = `${channel.name}_report_${from}_to_${to}.${format}`;

    if (action === ReportAction.DOWNLOAD) {
      return { 
        filename, 
        data: Buffer.isBuffer(file) ? file.toString('base64') : file, 
        contentType: format === 'csv' ? 'text/csv' : 'application/pdf' 
      };
    } else if (action === ReportAction.EMAIL) {
      const recipient = toEmail || 'laguiadelstreaming@gmail.com';
      await this.emailService.sendReportWithAttachment({
        to: recipient,
        subject: `Reporte del Canal ${channel.name}: ${filename}`,
        text: `Adjuntamos el reporte del canal ${channel.name} (${filename}).`,
        html: `<p>Adjuntamos el reporte del canal <b>${channel.name}</b> (<b>${filename}</b>).</p>`,
        attachments: [{ filename, content: Buffer.isBuffer(file) ? file : Buffer.from(file), contentType: format === 'csv' ? 'text/csv' : 'application/pdf' }],
      });
      return { success: true, message: `Reporte enviado a ${recipient}` };
    }
  }

  /**
   * Generate periodic reports (weekly, monthly, quarterly, yearly)
   */
  async generatePeriodicReport(
    period: ReportPeriod,
    from?: string,
    to?: string,
    channelId?: number,
    format: ReportFormat = ReportFormat.PDF,
    action: ReportAction = ReportAction.EMAIL,
  ) {
    let reportFrom: string;
    let reportTo: string;

    if (period === ReportPeriod.CUSTOM && from && to) {
      reportFrom = from;
      reportTo = to;
    } else {
      const dateRange = this.getDateRangeForPeriod(period);
      reportFrom = dateRange.from;
      reportTo = dateRange.to;
    }

    const reportType = this.getReportTypeForPeriod(period);
    const reportParams = {
      type: reportType,
      format,
      from: reportFrom,
      to: reportTo,
      channelId,
      action,
      toEmail: 'laguiadelstreaming@gmail.com',
    };

    const file = await this.reportsProxyService.generateReport(reportParams);
    const filename = `${period}_${reportType}_${reportFrom}_to_${reportTo}.${format}`;

    if (action === ReportAction.DOWNLOAD) {
      return { 
        filename, 
        data: Buffer.isBuffer(file) ? file.toString('base64') : file, 
        contentType: format === 'csv' ? 'text/csv' : 'application/pdf' 
      };
    } else if (action === ReportAction.EMAIL) {
      await this.emailService.sendReportWithAttachment({
        to: 'laguiadelstreaming@gmail.com',
        subject: `Reporte ${period} automático: ${filename}`,
        text: `Adjuntamos el reporte ${period} automático (${filename}).`,
        html: `<p>Adjuntamos el reporte <b>${period}</b> automático (<b>${filename}</b>).</p>`,
        attachments: [{ filename, content: Buffer.isBuffer(file) ? file : Buffer.from(file), contentType: format === 'csv' ? 'text/csv' : 'application/pdf' }],
      });
      return { success: true, message: `Reporte ${period} enviado automáticamente` };
    }
    
    // Default return for other actions
    return { success: true, message: `Reporte ${period} generado correctamente` };
  }

  /**
   * Get channel data for table display
   */
  private async getChannelDataTable(channelId: number, from: string, to: string) {
    const subscriptions = await this.subscriptionRepository
      .createQueryBuilder('subscription')
      .leftJoinAndSelect('subscription.user', 'user')
      .leftJoinAndSelect('subscription.program', 'program')
      .leftJoinAndSelect('program.channel', 'channel')
      .where('channel.id = :channelId', { channelId })
      .andWhere('subscription.createdAt >= :from', { from })
      .andWhere('subscription.createdAt <= :to', { to })
      .orderBy('subscription.createdAt', 'DESC')
      .getMany();

    return {
      channelId,
      subscriptions: subscriptions.map(sub => ({
        id: sub.id,
        createdAt: sub.createdAt,
        user: sub.user ? { id: sub.user.id, firstName: sub.user.firstName, lastName: sub.user.lastName } : null,
        program: sub.program ? { id: sub.program.id, name: sub.program.name } : null,
      })),
      total: subscriptions.length,
    };
  }

  /**
   * Get date range for different periods
   */
  private getDateRangeForPeriod(period: ReportPeriod): { from: string; to: string } {
    const now = dayjs();
    
    switch (period) {
      case ReportPeriod.WEEKLY:
        return {
          from: now.subtract(7, 'day').format('YYYY-MM-DD'),
          to: now.format('YYYY-MM-DD'),
        };
      case ReportPeriod.MONTHLY:
        return {
          from: now.subtract(1, 'month').format('YYYY-MM-DD'),
          to: now.format('YYYY-MM-DD'),
        };
      case ReportPeriod.QUARTERLY:
        return {
          from: now.subtract(3, 'month').format('YYYY-MM-DD'),
          to: now.format('YYYY-MM-DD'),
        };
      case ReportPeriod.YEARLY:
        return {
          from: now.subtract(1, 'year').format('YYYY-MM-DD'),
          to: now.format('YYYY-MM-DD'),
        };
      default:
        throw new Error('Invalid period');
    }
  }

  /**
   * Get report type for different periods
   */
  private getReportTypeForPeriod(period: ReportPeriod): ReportType {
    switch (period) {
      case ReportPeriod.WEEKLY:
        return ReportType.WEEKLY_SUMMARY;
      case ReportPeriod.MONTHLY:
        return ReportType.MONTHLY_SUMMARY;
      case ReportPeriod.QUARTERLY:
        return ReportType.QUARTERLY_SUMMARY;
      case ReportPeriod.YEARLY:
        return ReportType.YEARLY_SUMMARY;
      default:
        return ReportType.WEEKLY_SUMMARY;
    }
  }

  /**
   * Get all channels for channel-specific reports
   */
  async getAllChannels() {
    return this.channelRepository.find({ order: { order: 'ASC' } });
  }

  /**
   * Automatic weekly report - runs every Sunday at 6 PM
   */
  @Cron('0 18 * * 0')
  async generateAutomaticWeeklyReport() {
    console.log('Generating automatic weekly report...');
    try {
      await this.generatePeriodicReport(ReportPeriod.WEEKLY);
      console.log('Automatic weekly report generated and sent successfully');
    } catch (error) {
      console.error('Error generating automatic weekly report:', error);
    }
  }

  /**
   * Automatic monthly report - runs on the 1st of each month at 9 AM
   */
  @Cron('0 9 1 * *')
  async generateAutomaticMonthlyReport() {
    console.log('Generating automatic monthly report...');
    try {
      await this.generatePeriodicReport(ReportPeriod.MONTHLY);
      console.log('Automatic monthly report generated and sent successfully');
    } catch (error) {
      console.error('Error generating automatic monthly report:', error);
    }
  }

  /**
   * Automatic yearly report - runs on January 1st at 10 AM
   */
  @Cron('0 10 1 1 *')
  async generateAutomaticYearlyReport() {
    console.log('Generating automatic yearly report...');
    try {
      await this.generatePeriodicReport(ReportPeriod.YEARLY);
      console.log('Automatic yearly report generated and sent successfully');
    } catch (error) {
      console.error('Error generating automatic yearly report:', error);
    }
  }
} 