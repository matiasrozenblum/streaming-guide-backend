import { EmailService } from './email.service';
import { MailerService } from '@nestjs-modules/mailer';
import { SentryService } from '../sentry/sentry.service';
import { ProposedChange } from '../proposed-changes/proposed-changes.entity';

describe('EmailService', () => {
  let service: EmailService;
  let mockMailerService: jest.Mocked<MailerService>;
  let mockSentryService: jest.Mocked<SentryService>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockMailerService = {
      sendMail: jest.fn(),
    } as any;

    mockSentryService = {
      captureMessage: jest.fn(),
      captureException: jest.fn(),
      setTag: jest.fn(),
      addBreadcrumb: jest.fn(),
    } as any;

    service = new EmailService(mockMailerService, mockSentryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sendProposedChangesReport', () => {
    const mockChanges: ProposedChange[] = [
      {
        id: 1,
        program_id: 'prog1',
        day_of_week: 'monday',
        start_time: '10:00',
        end_time: '11:00',
        change_type: 'added',
        created_at: new Date(),
        updated_at: new Date(),
      },
    ] as any;

    it('sends email successfully when changes exist', async () => {
      mockMailerService.sendMail.mockResolvedValue(undefined);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      await service.sendProposedChangesReport(mockChanges);
      
      expect(mockMailerService.sendMail).toHaveBeenCalledWith({
        to: 'laguiadelstreaming@gmail.com',
        subject: '📋 Nuevos cambios detectados en la programación',
        html: expect.stringContaining('Cambios propuestos'),
      });
      expect(consoleSpy).toHaveBeenCalledWith('📬 Email de cambios enviado.');
    });

    it('does not send email when no changes exist', async () => {
      await service.sendProposedChangesReport([]);
      
      expect(mockMailerService.sendMail).not.toHaveBeenCalled();
    });

    it('reports error to Sentry when email fails', async () => {
      const error = new Error('SMTP connection failed');
      mockMailerService.sendMail.mockRejectedValue(error);
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      await expect(service.sendProposedChangesReport(mockChanges)).rejects.toThrow('SMTP connection failed');
      
      expect(consoleSpy).toHaveBeenCalledWith('❌ Error sending proposed changes email:', error);
      expect(mockSentryService.captureMessage).toHaveBeenCalledWith(
        'Email service failure - Proposed changes report failed',
        'error',
        expect.objectContaining({
          service: 'email',
          error_type: 'send_failure',
          error_message: 'SMTP connection failed',
          email_type: 'proposed_changes_report',
          recipient: 'laguiadelstreaming@gmail.com',
        })
      );
      expect(mockSentryService.setTag).toHaveBeenCalledWith('service', 'email');
      expect(mockSentryService.setTag).toHaveBeenCalledWith('error_type', 'send_failure');
    });
  });

  describe('sendOtpCode', () => {
    it('sends OTP email successfully', async () => {
      mockMailerService.sendMail.mockResolvedValue(undefined);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      await service.sendOtpCode('test@example.com', '123456', 5);
      
      expect(mockMailerService.sendMail).toHaveBeenCalledWith({
        to: 'test@example.com',
        subject: 'Tu código de acceso • La Guía del Streaming',
        html: expect.stringContaining('123456'),
      });
      expect(consoleSpy).toHaveBeenCalledWith('OTP enviado a test@example.com: 123456');
    });

    it('reports error to Sentry when OTP email fails', async () => {
      const error = new Error('Invalid email address');
      mockMailerService.sendMail.mockRejectedValue(error);
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      await expect(service.sendOtpCode('invalid@example.com', '123456', 5)).rejects.toThrow('Invalid email address');
      
      expect(consoleSpy).toHaveBeenCalledWith('❌ Error sending OTP email:', error);
      expect(mockSentryService.captureMessage).toHaveBeenCalledWith(
        'Email service failure - OTP code failed to send',
        'error',
        expect.objectContaining({
          service: 'email',
          error_type: 'send_failure',
          error_message: 'Invalid email address',
          email_type: 'otp_code',
          recipient: 'invalid@example.com',
        })
      );
      expect(mockSentryService.setTag).toHaveBeenCalledWith('service', 'email');
      expect(mockSentryService.setTag).toHaveBeenCalledWith('error_type', 'send_failure');
    });
  });

  describe('sendReportWithAttachment', () => {
    const mockAttachments = [
      {
        filename: 'report.pdf',
        content: Buffer.from('test'),
        contentType: 'application/pdf',
      },
    ];

    it('sends report with attachment successfully', async () => {
      mockMailerService.sendMail.mockResolvedValue(undefined);
      
      await service.sendReportWithAttachment({
        to: 'admin@example.com',
        subject: 'Weekly Report',
        text: 'Report content',
        html: '<h1>Report</h1>',
        attachments: mockAttachments,
      });
      
      expect(mockMailerService.sendMail).toHaveBeenCalledWith({
        to: 'admin@example.com',
        subject: 'Weekly Report',
        text: 'Report content',
        html: '<h1>Report</h1>',
        attachments: mockAttachments,
      });
    });

    it('reports error to Sentry when report email fails', async () => {
      const error = new Error('Attachment too large');
      mockMailerService.sendMail.mockRejectedValue(error);
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      await expect(service.sendReportWithAttachment({
        to: 'admin@example.com',
        subject: 'Weekly Report',
        text: 'Report content',
        html: '<h1>Report</h1>',
        attachments: mockAttachments,
      })).rejects.toThrow('Attachment too large');
      
      expect(consoleSpy).toHaveBeenCalledWith('❌ Error sending report with attachment:', error);
      expect(mockSentryService.captureMessage).toHaveBeenCalledWith(
        'Email service failure - Report with attachment failed',
        'error',
        expect.objectContaining({
          service: 'email',
          error_type: 'send_failure',
          error_message: 'Attachment too large',
          email_type: 'report_with_attachment',
          recipient: 'admin@example.com',
          subject: 'Weekly Report',
        })
      );
      expect(mockSentryService.setTag).toHaveBeenCalledWith('service', 'email');
      expect(mockSentryService.setTag).toHaveBeenCalledWith('error_type', 'send_failure');
    });
  });

  describe('buildOtpHtml', () => {
    it('generates OTP HTML with correct code and TTL', () => {
      const html = service['buildOtpHtml']('123456', 5);
      
      expect(html).toContain('123456');
      expect(html).toContain('5 minutos');
      expect(html).toContain('La Guía del Streaming');
    });

    it('handles different TTL values', () => {
      const html = service['buildOtpHtml']('654321', 10);
      
      expect(html).toContain('654321');
      expect(html).toContain('10 minutos');
    });
  });
}); 