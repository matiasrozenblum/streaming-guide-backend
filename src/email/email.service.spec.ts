import { Test, TestingModule } from '@nestjs/testing';
import { EmailService } from './email.service';
import { MailerService } from '@nestjs-modules/mailer';
import { ProposedChange } from '../proposed-changes/proposed-changes.entity';

describe('EmailService', () => {
  let service: EmailService;
  let mailerService: MailerService;

  const mockMailerService = {
    sendMail: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        {
          provide: MailerService,
          useValue: mockMailerService,
        },
      ],
    }).compile();

    service = module.get<EmailService>(EmailService);
    mailerService = module.get<MailerService>(MailerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sendOtpCode', () => {
    it('should send OTP code email', async () => {
      const email = 'test@example.com';
      const code = '123456';
      const ttlMinutes = 10;

      mockMailerService.sendMail.mockResolvedValue({ messageId: 'test-message-id' });

      await service.sendOtpCode(email, code, ttlMinutes);

      expect(mockMailerService.sendMail).toHaveBeenCalledWith({
        to: email,
        subject: 'Tu código de acceso • La Guía del Streaming',
        html: expect.stringContaining(code),
      });
    });

    it('should handle email sending errors', async () => {
      const email = 'test@example.com';
      const code = '123456';
      const ttlMinutes = 10;
      const error = new Error('Email sending failed');

      mockMailerService.sendMail.mockRejectedValue(error);

      await expect(service.sendOtpCode(email, code, ttlMinutes)).rejects.toThrow('Email sending failed');
    });
  });

  describe('sendProposedChangesReport', () => {
    it('should send proposed changes report email', async () => {
      const changes: ProposedChange[] = [
        {
          id: 1,
          entityType: 'program',
          action: 'create',
          channelName: 'Test Channel',
          programName: 'New Program',
          after: { name: 'New Program' },
          status: 'pending',
          createdAt: new Date(),
        },
      ];

      mockMailerService.sendMail.mockResolvedValue({ messageId: 'test-message-id' });

      await service.sendProposedChangesReport(changes);

      expect(mockMailerService.sendMail).toHaveBeenCalledWith({
        to: 'laguiadelstreaming@gmail.com',
        subject: '📋 Nuevos cambios detectados en la programación',
        html: expect.stringContaining('New Program'),
      });
    });

    it('should handle empty changes array', async () => {
      const changes: ProposedChange[] = [];

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await service.sendProposedChangesReport(changes);

      expect(consoleSpy).toHaveBeenCalledWith('No hay cambios para reportar por email.');
      expect(mockMailerService.sendMail).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should handle report sending errors', async () => {
      const changes: ProposedChange[] = [
        {
          id: 1,
          entityType: 'program',
          action: 'create',
          channelName: 'Test Channel',
          programName: 'New Program',
          after: { name: 'New Program' },
          status: 'pending',
          createdAt: new Date(),
        },
      ];
      const error = new Error('Email sending failed');

      mockMailerService.sendMail.mockRejectedValue(error);

      await expect(service.sendProposedChangesReport(changes)).rejects.toThrow('Email sending failed');
    });
  });
}); 