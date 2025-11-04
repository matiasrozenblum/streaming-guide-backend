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

    const mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'SENDGRID_API_KEY') {
          return null; // No SendGrid API key, so it will fall back to SMTP
        }
        return 'test-value';
      }),
    } as any;

    service = new EmailService(mockMailerService, mockSentryService, mockConfigService);
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
        from: expect.stringContaining('notifications@laguiadelstreaming.com'),
        to: 'admin@laguiadelstreaming.com',
        subject: '📋 Nuevos cambios detectados en la programación',
        html: expect.stringContaining('Cambios propuestos'),
      });
      expect(consoleSpy).toHaveBeenCalledWith('📬 Email de cambios enviado via SMTP.');
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
          recipient: 'admin@laguiadelstreaming.com',
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
      expect(consoleSpy).toHaveBeenCalledWith('OTP enviado a test@example.com via SMTP: 123456');
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

  describe('sendEmail', () => {
    it('sends email successfully via SMTP when no SendGrid API key', async () => {
      mockMailerService.sendMail.mockResolvedValue(undefined);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      await service.sendEmail({
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<h1>Test Content</h1>',
        text: 'Test Content'
      });
      
      expect(mockMailerService.sendMail).toHaveBeenCalledWith({
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<h1>Test Content</h1>',
        text: 'Test Content'
      });
      expect(consoleSpy).toHaveBeenCalledWith('Email enviado a test@example.com via SMTP');
    });

    it('generates text from HTML when text not provided', async () => {
      mockMailerService.sendMail.mockResolvedValue(undefined);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      await service.sendEmail({
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<h1>Test Content</h1><p>This is a paragraph.</p>'
      });
      
      expect(mockMailerService.sendMail).toHaveBeenCalledWith({
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<h1>Test Content</h1><p>This is a paragraph.</p>',
        text: 'Test ContentThis is a paragraph.'
      });
      expect(consoleSpy).toHaveBeenCalledWith('Email enviado a test@example.com via SMTP');
    });

    it('tries SendGrid first when API key is available', async () => {
      const mockConfigService = {
        get: jest.fn().mockImplementation((key: string) => {
          if (key === 'SENDGRID_API_KEY') {
            return 'test-sendgrid-key';
          }
          return 'test-value';
        }),
      } as any;

      service = new EmailService(mockMailerService, mockSentryService, mockConfigService);
      
      // Mock the private sendViaSendGrid method
      const sendViaSendGridSpy = jest.spyOn(service as any, 'sendViaSendGrid').mockResolvedValue(undefined);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      await service.sendEmail({
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<h1>Test Content</h1>'
      });
      
      expect(sendViaSendGridSpy).toHaveBeenCalledWith('test@example.com', 'Test Subject', '<h1>Test Content</h1>', 'general');
      expect(consoleSpy).toHaveBeenCalledWith('Email enviado a test@example.com via SendGrid');
      expect(mockMailerService.sendMail).not.toHaveBeenCalled();
    });

    it('falls back to SMTP when SendGrid fails', async () => {
      const mockConfigService = {
        get: jest.fn().mockImplementation((key: string) => {
          if (key === 'SENDGRID_API_KEY') {
            return 'test-sendgrid-key';
          }
          return 'test-value';
        }),
      } as any;

      service = new EmailService(mockMailerService, mockSentryService, mockConfigService);
      
      // Mock SendGrid to fail
      const sendViaSendGridSpy = jest.spyOn(service as any, 'sendViaSendGrid').mockRejectedValue(new Error('SendGrid API error'));
      mockMailerService.sendMail.mockResolvedValue(undefined);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      await service.sendEmail({
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<h1>Test Content</h1>'
      });
      
      expect(sendViaSendGridSpy).toHaveBeenCalledWith('test@example.com', 'Test Subject', '<h1>Test Content</h1>', 'general');
      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ SendGrid failed, falling back to SMTP:', expect.any(Error));
      expect(mockMailerService.sendMail).toHaveBeenCalledWith({
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<h1>Test Content</h1>',
        text: 'Test Content'
      });
      expect(consoleSpy).toHaveBeenCalledWith('Email enviado a test@example.com via SMTP');
    });

    it('reports error to Sentry when SMTP fails', async () => {
      const error = new Error('SMTP connection failed');
      mockMailerService.sendMail.mockRejectedValue(error);
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      await expect(service.sendEmail({
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<h1>Test Content</h1>'
      })).rejects.toThrow('SMTP connection failed');
      
      expect(consoleSpy).toHaveBeenCalledWith('❌ Error sending email:', error);
      expect(mockSentryService.captureMessage).toHaveBeenCalledWith(
        'Email service failure - generic email failed to send',
        'error',
        expect.objectContaining({
          service: 'email',
          error_type: 'send_failure',
          error_message: 'SMTP connection failed',
          email_type: 'general',
          recipient: 'test@example.com',
        })
      );
      expect(mockSentryService.setTag).toHaveBeenCalledWith('service', 'email');
      expect(mockSentryService.setTag).toHaveBeenCalledWith('error_type', 'send_failure');
    });
  });

  describe('stripHtml', () => {
    it('removes HTML tags and normalizes whitespace', () => {
      const html = '<h1>Test Title</h1><p>This is a   paragraph with   extra spaces.</p>';
      const result = service['stripHtml'](html);
      
      expect(result).toBe('Test TitleThis is a paragraph with extra spaces.');
    });

    it('handles empty HTML', () => {
      const result = service['stripHtml']('');
      expect(result).toBe('');
    });

    it('handles HTML with only tags', () => {
      const result = service['stripHtml']('<div><span></span></div>');
      expect(result).toBe('');
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