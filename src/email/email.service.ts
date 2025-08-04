import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { ProposedChange } from '../proposed-changes/proposed-changes.entity';
import { buildProposedChangesReportHtml } from './email.templates';
import { SentryService } from '../sentry/sentry.service';

@Injectable()
export class EmailService {
  constructor(
    private readonly mailerService: MailerService,
    private readonly sentryService: SentryService,
  ) {}

  async sendProposedChangesReport(changes: ProposedChange[]) {
    if (changes.length === 0) {
      console.log('No hay cambios para reportar por email.');
      return;
    }

    const htmlContent = buildProposedChangesReportHtml(changes);

    try {
      await this.mailerService.sendMail({
        to: 'laguiadelstreaming@gmail.com',
        subject: '📋 Nuevos cambios detectados en la programación',
        html: htmlContent,
      });

      console.log('📬 Email de cambios enviado.');
    } catch (error) {
      console.error('❌ Error sending proposed changes email:', error);
      
      this.sentryService.captureMessage('Email service failure - Proposed changes report failed', 'error', {
        service: 'email',
        error_type: 'send_failure',
        error_message: error.message,
        email_type: 'proposed_changes_report',
        recipient: 'laguiadelstreaming@gmail.com',
        timestamp: new Date().toISOString(),
      });
      
      this.sentryService.setTag('service', 'email');
      this.sentryService.setTag('error_type', 'send_failure');
      
      throw error; // Re-throw to maintain original behavior
    }
  }

  async sendOtpCode(to: string, code: string, ttlMinutes: number) {
    const html = this.buildOtpHtml(code, ttlMinutes);
    
    try {
      await this.mailerService.sendMail({
        to,
        subject: 'Tu código de acceso • La Guía del Streaming',
        html,
      });
      console.log(`OTP enviado a ${to}: ${code}`);
    } catch (error) {
      console.error('❌ Error sending OTP email:', error);
      
      this.sentryService.captureMessage('Email service failure - OTP code failed to send', 'error', {
        service: 'email',
        error_type: 'send_failure',
        error_message: error.message,
        email_type: 'otp_code',
        recipient: to,
        timestamp: new Date().toISOString(),
      });
      
      this.sentryService.setTag('service', 'email');
      this.sentryService.setTag('error_type', 'send_failure');
      
      throw error; // Re-throw to maintain original behavior
    }
  }

  private buildOtpHtml(code: string, ttl: number) {
    return `
      <div style="font-family: sans-serif; line-height:1.4;">
        <h2>Tu código de acceso</h2>
        <p>Usa este código para acceder a <strong>La Guía del Streaming</strong>:</p>
        <p style="font-size: 2rem; margin: .5em 0;"><strong>${code}</strong></p>
        <p>Va a expirar en ${ttl} minutos.</p>
        <hr/>
        <p style="font-size:.8em; color: #666;">
          Si no solicitaste este código, puedes ignorar este mensaje.
        </p>
      </div>
    `;
  }

  async sendReportWithAttachment({ to, subject, text, html, attachments }: { to: string, subject: string, text: string, html: string, attachments: { filename: string, content: Buffer, contentType: string }[] }) {
    try {
      await this.mailerService.sendMail({
        to,
        subject,
        text,
        html,
        attachments,
      });
    } catch (error) {
      console.error('❌ Error sending report with attachment:', error);
      
      this.sentryService.captureMessage('Email service failure - Report with attachment failed', 'error', {
        service: 'email',
        error_type: 'send_failure',
        error_message: error.message,
        email_type: 'report_with_attachment',
        recipient: to,
        subject: subject,
        timestamp: new Date().toISOString(),
      });
      
      this.sentryService.setTag('service', 'email');
      this.sentryService.setTag('error_type', 'send_failure');
      
      throw error; // Re-throw to maintain original behavior
    }
  }

  // Alias for backward compatibility (in case of cached builds)
  async sendReportWithAttachments(
    toOrParams: string | { to: string, subject: string, text: string, html: string, attachments: { filename: string, content: Buffer, contentType: string }[] },
    attachments?: { filename: string, content: Buffer, contentType: string }[]
  ) {
    // Handle both calling patterns:
    // 1. sendReportWithAttachments(params) - single object
    // 2. sendReportWithAttachments(to, attachments) - separate parameters
    
    if (typeof toOrParams === 'string') {
      // Called with separate parameters: sendReportWithAttachments(to, attachments)
      if (!attachments) {
        throw new Error('Attachments parameter is required when calling with separate parameters');
      }
      return this.sendReportWithAttachment({
        to: toOrParams,
        subject: 'Reporte solicitado',
        text: 'Adjuntamos el reporte solicitado.',
        html: '<p>Adjuntamos el reporte solicitado.</p>',
        attachments,
      });
    } else {
      // Called with single object parameter: sendReportWithAttachments(params)
      return this.sendReportWithAttachment(toOrParams);
    }
  }
}
