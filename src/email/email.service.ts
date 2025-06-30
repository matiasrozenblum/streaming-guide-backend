import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { ProposedChange } from '../proposed-changes/proposed-changes.entity';
import { buildProposedChangesReportHtml } from './email.templates';

@Injectable()
export class EmailService {
  constructor(private readonly mailerService: MailerService) {}

  async sendProposedChangesReport(changes: ProposedChange[]) {
    if (changes.length === 0) {
      console.log('No hay cambios para reportar por email.');
      return;
    }

    const htmlContent = buildProposedChangesReportHtml(changes);

    await this.mailerService.sendMail({
      to: 'laguiadelstreaming@gmail.com',
      subject: '📋 Nuevos cambios detectados en la programación',
      html: htmlContent,
    });

    console.log('📬 Email de cambios enviado.');
  }

  async sendOtpCode(to: string, code: string, ttlMinutes: number) {
    const html = this.buildOtpHtml(code, ttlMinutes);
    await this.mailerService.sendMail({
      to,
      subject: 'Tu código de acceso • La Guía del Streaming',
      html,
    });
    console.log(`OTP enviado a ${to}: ${code}`);
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
    await this.mailerService.sendMail({
      to,
      subject,
      text,
      html,
      attachments,
    });
  }

  async sendReportWithAttachments(to: string, attachments: { filename: string, content: Buffer }[]) {
    await this.mailerService.sendMail({
      to,
      subject: 'Reportes solicitados • La Guía del Streaming',
      text: 'Adjuntamos los reportes solicitados.',
      html: '<p>Adjuntamos los reportes solicitados.</p>',
      attachments,
    });
  }
}
