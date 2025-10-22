import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { ProposedChange } from '../proposed-changes/proposed-changes.entity';
import { buildProposedChangesReportHtml } from './email.templates';
import { SentryService } from '../sentry/sentry.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  constructor(
    private readonly mailerService: MailerService,
    private readonly sentryService: SentryService,
    private readonly configService: ConfigService,
  ) {}

  async sendProposedChangesReport(changes: ProposedChange[]) {
    if (changes.length === 0) {
      console.log('No hay cambios para reportar por email.');
      return;
    }

    const htmlContent = buildProposedChangesReportHtml(changes);
    const to = 'laguiadelstreaming@gmail.com';
    const subject = '📋 Nuevos cambios detectados en la programación';

    // Try SendGrid first if configured, fallback to SMTP
    const sendGridApiKey = this.configService.get('SENDGRID_API_KEY');
    
    if (sendGridApiKey) {
      try {
        await this.sendViaSendGrid(to, subject, htmlContent, 'proposed_changes_report');
        console.log('📬 Email de cambios enviado via SendGrid.');
        return;
      } catch (error) {
        console.error('❌ SendGrid failed, falling back to SMTP:', error);
        // Fall through to SMTP
      }
    }

    // Fallback to SMTP
    try {
      await this.mailerService.sendMail({
        to,
        subject,
        html: htmlContent,
      });

      console.log('📬 Email de cambios enviado via SMTP.');
    } catch (error) {
      console.error('❌ Error sending proposed changes email:', error);
      
      this.sentryService.captureMessage('Email service failure - Proposed changes report failed', 'error', {
        service: 'email',
        error_type: 'send_failure',
        error_message: error.message,
        email_type: 'proposed_changes_report',
        recipient: to,
        timestamp: new Date().toISOString(),
      });
      
      this.sentryService.setTag('service', 'email');
      this.sentryService.setTag('error_type', 'send_failure');
      
      throw error; // Re-throw to maintain original behavior
    }
  }

  async sendOtpCode(to: string, code: string, ttlMinutes: number) {
    const html = this.buildOtpHtml(code, ttlMinutes);
    
    // Try SendGrid first if configured, fallback to SMTP
    const sendGridApiKey = this.configService.get('SENDGRID_API_KEY');
    
      if (sendGridApiKey) {
        try {
        await this.sendViaSendGrid(to, 'Tu código de acceso • La Guía del Streaming', html, 'otp_code');
        console.log(`OTP enviado a ${to} via SendGrid: ${code}`);
        return;
      } catch (error) {
        console.error('❌ SendGrid failed, falling back to SMTP:', error);
        // Fall through to SMTP
      }
    }
    
    // Fallback to SMTP
    try {
      await this.mailerService.sendMail({
        to,
        subject: 'Tu código de acceso • La Guía del Streaming',
        html,
      });
      console.log(`OTP enviado a ${to} via SMTP: ${code}`);
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

  private async sendViaSendGrid(to: string, subject: string, html: string, emailType: string = 'general') {
    const sgMail = require('@sendgrid/mail');
    const apiKey = this.configService.get('SENDGRID_API_KEY');
    
    sgMail.setApiKey(apiKey);
    
    // Generate appropriate text version based on email type
    let textContent = 'Mensaje de La Guía del Streaming.';
    let categories = ['general'];
    let customArgs = { 'source': 'general', 'app': 'streaming_guide' };
    
    if (emailType === 'otp_code') {
      textContent = 'Tu código de acceso para La Guía del Streaming. Este código expirará en 5 minutos. Si no solicitaste este código, puedes ignorar este mensaje.';
      categories = ['otp', 'authentication'];
      customArgs = { 'source': 'password_recovery', 'app': 'streaming_guide' };
    } else if (emailType === 'proposed_changes_report') {
      textContent = 'Nuevos cambios detectados en la programación. Revisa el contenido HTML para más detalles.';
      categories = ['reports', 'programming_changes'];
      customArgs = { 'source': 'programming_changes', 'app': 'streaming_guide' };
    }
    const msg = {
      to,
      from: {
        email: this.configService.get('SMTP_USER'),
        name: 'La Guía del Streaming'
      },
      subject,
      html,
      // Add text version for better deliverability
      text: textContent,
      // Add tracking and categorization
      categories,
      // Add custom headers for better deliverability
      headers: {
        'X-Mailer': 'La Guía del Streaming',
        'X-Priority': '1',
        'X-MSMail-Priority': 'High',
        'X-Auto-Response-Suppress': 'All',
        'Precedence': 'bulk'
      },
      // Add reply-to for better deliverability
      replyTo: this.configService.get('SMTP_USER'),
      // Add custom args for tracking
      customArgs
    };
    
    await sgMail.send(msg);
  }

  private async sendViaSendGridWithAttachments(to: string, subject: string, html: string, text: string, attachments: { filename: string, content: Buffer, contentType: string }[], emailType: string = 'general') {
    const sgMail = require('@sendgrid/mail');
    const apiKey = this.configService.get('SENDGRID_API_KEY');
    
    sgMail.setApiKey(apiKey);
    
    // Convert attachments to SendGrid format
    const sendGridAttachments = attachments.map(attachment => ({
      content: attachment.content.toString('base64'),
      filename: attachment.filename,
      type: attachment.contentType,
      disposition: 'attachment'
    }));
    
    let categories = ['reports'];
    let customArgs = { 'source': 'reports', 'app': 'streaming_guide' };
    
    if (emailType === 'report_with_attachment') {
      categories = ['reports', 'attachments'];
      customArgs = { 'source': 'reports', 'app': 'streaming_guide' };
    }
    
    const msg = {
      to,
      from: {
        email: this.configService.get('SMTP_USER'),
        name: 'La Guía del Streaming'
      },
      subject,
      html,
      text,
      attachments: sendGridAttachments,
      // Add tracking and categorization
      categories,
      // Add custom headers for better deliverability
      headers: {
        'X-Mailer': 'La Guía del Streaming',
        'X-Priority': '1',
        'X-MSMail-Priority': 'High',
        'X-Auto-Response-Suppress': 'All',
        'Precedence': 'bulk'
      },
      // Add reply-to for better deliverability
      replyTo: this.configService.get('SMTP_USER'),
      // Add custom args for tracking
      customArgs
    };
    
    await sgMail.send(msg);
  }

  private buildOtpHtml(code: string, ttl: number) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Tu código de acceso - La Guía del Streaming</title>
      </head>
      <body style="margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
        <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #333; margin: 0; font-size: 24px;">La Guía del Streaming</h1>
          </div>
          
          <h2 style="color: #333; text-align: center; margin-bottom: 20px;">Tu código de acceso</h2>
          
          <p style="color: #666; text-align: center; margin-bottom: 30px; font-size: 16px;">
            Usa este código para acceder a tu cuenta:
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <div style="display: inline-block; background-color: #f8f9fa; border: 2px solid #e9ecef; border-radius: 8px; padding: 20px; font-family: 'Courier New', monospace; font-size: 32px; font-weight: bold; color: #333; letter-spacing: 4px;">
              ${code}
            </div>
          </div>
          
          <p style="color: #666; text-align: center; margin-bottom: 30px; font-size: 14px;">
            ⏰ Este código expirará en ${ttl} minutos
          </p>
          
          <hr style="border: none; border-top: 1px solid #e9ecef; margin: 30px 0;">
          
          <p style="color: #999; text-align: center; font-size: 12px; margin: 0;">
            Si no solicitaste este código, puedes ignorar este mensaje de forma segura.
          </p>
          
          <p style="color: #999; text-align: center; font-size: 12px; margin: 10px 0 0 0;">
            © 2024 La Guía del Streaming. Todos los derechos reservados.
          </p>
        </div>
      </body>
      </html>
    `;
  }

  async sendReportWithAttachment({ to, subject, text, html, attachments }: { to: string, subject: string, text: string, html: string, attachments: { filename: string, content: Buffer, contentType: string }[] }) {
    // Try SendGrid first if configured, fallback to SMTP
    const sendGridApiKey = this.configService.get('SENDGRID_API_KEY');
    
    if (sendGridApiKey) {
      try {
        await this.sendViaSendGridWithAttachments(to, subject, html, text, attachments, 'report_with_attachment');
        console.log(`📬 Report with attachment enviado a ${to} via SendGrid.`);
        return;
      } catch (error) {
        console.error('❌ SendGrid failed, falling back to SMTP:', error);
        // Fall through to SMTP
      }
    }

    // Fallback to SMTP
    try {
      await this.mailerService.sendMail({
        to,
        subject,
        text,
        html,
        attachments,
      });
      console.log(`📬 Report with attachment enviado a ${to} via SMTP.`);
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

  /**
   * Generic method to send emails
   */
  async sendEmail(params: { to: string; subject: string; html: string; text?: string }) {
    const { to, subject, html, text } = params;
    
    // Try SendGrid first if configured, fallback to SMTP
    const sendGridApiKey = this.configService.get('SENDGRID_API_KEY');
    
    if (sendGridApiKey) {
      try {
        await this.sendViaSendGrid(to, subject, html, 'general');
        console.log(`Email enviado a ${to} via SendGrid`);
        return;
      } catch (error) {
        console.error('❌ SendGrid failed, falling back to SMTP:', error);
        // Fall through to SMTP
      }
    }
    
    // Fallback to SMTP
    try {
      await this.mailerService.sendMail({
        to,
        subject,
        html,
        text: text || this.stripHtml(html),
      });
      console.log(`Email enviado a ${to} via SMTP`);
    } catch (error) {
      console.error('❌ Error sending email:', error);
      
      this.sentryService.captureMessage('Email service failure - generic email failed to send', 'error', {
        service: 'email',
        error_type: 'send_failure',
        error_message: error.message,
        email_type: 'general',
        recipient: to,
        timestamp: new Date().toISOString(),
      });
      
      this.sentryService.setTag('service', 'email');
      this.sentryService.setTag('error_type', 'send_failure');
      
      throw error;
    }
  }

  /**
   * Strip HTML tags to create plain text version
   */
  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }
}
