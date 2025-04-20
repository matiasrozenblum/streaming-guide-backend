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
}
