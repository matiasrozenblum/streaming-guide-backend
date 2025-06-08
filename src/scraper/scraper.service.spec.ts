import { Test, TestingModule } from '@nestjs/testing';
import { ScraperService } from './scraper.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Channel } from '../channels/channels.entity';
import { Program } from '../programs/programs.entity';
import { Schedule } from '../schedules/schedules.entity';
import * as VorterixModule from './vorterix.scraper';
import * as GelatinaModule from './gelatina.scraper';
import * as UrbanaModule from './urbana.scraper';
import { ProposedChangesService } from '../proposed-changes/proposed-changes.service';
import { EmailService } from '../email/email.service';

describe('ScraperService', () => {
  let service: ScraperService;

  const mockChannelRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockProgramRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockScheduleRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const mockProposedChangesService = {
    // Mock service methods here
    someMethod: jest.fn(),
    clearPendingChangesForChannel: jest.fn(),
    createProposedChange: jest.fn(),
    getPendingChanges: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScraperService,
        { provide: getRepositoryToken(Channel), useValue: mockChannelRepo },
        { provide: getRepositoryToken(Program), useValue: mockProgramRepo },
        { provide: getRepositoryToken(Schedule), useValue: mockScheduleRepo },
        {
          provide: ProposedChangesService,
          useValue: mockProposedChangesService,
        },
        {
          provide: EmailService,
          useValue: {
            // Mock email service methods here
            sendProposedChangesReport: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ScraperService>(ScraperService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('insertVorterixSchedule', () => {
    it('should propose changes for Vorterix schedule', async () => {
      // Mock de la función que scrapea
      jest.spyOn(VorterixModule, 'scrapeVorterixSchedule').mockResolvedValue([
        {
          name: 'Demo Show',
          days: ['lunes'],
          startTime: '10:00',
          endTime: '12:00',
        },
      ]);
    
      // Mocks de repositorios
      mockChannelRepo.findOne.mockResolvedValue(null);
      mockChannelRepo.create.mockReturnValue({ name: 'Vorterix' });
      mockChannelRepo.save.mockResolvedValue({ id: 1, name: 'Vorterix' });
    
      mockProgramRepo.findOne.mockResolvedValue(null);
      mockProgramRepo.find.mockResolvedValue([]); // No existing programs found
      mockProgramRepo.create.mockReturnValue({ name: 'Demo Show' });
      mockProgramRepo.save.mockResolvedValue({ id: 1, name: 'Demo Show' });
    
      mockScheduleRepo.findOne.mockResolvedValue(null);
    
      // Mock de proposedChangesService
      mockProposedChangesService.clearPendingChangesForChannel = jest.fn().mockResolvedValue(undefined);
      mockProposedChangesService.createProposedChange = jest.fn().mockResolvedValue(undefined);
    
      // Ejecutar
      const result = await service.insertVorterixSchedule();
    
      // Verificaciones
      expect(result).toEqual({ success: true });
      expect(mockChannelRepo.create).toHaveBeenCalled();
      expect(mockProposedChangesService.clearPendingChangesForChannel).toHaveBeenCalledWith('Vorterix');
    
      expect(mockProposedChangesService.createProposedChange).toHaveBeenCalledWith([
        {
          entityType: 'program',
          action: 'create',
          channelName: 'Vorterix',
          programName: 'Demo Show',
          before: null,
          after: {
            name: 'Demo Show',
            channelId: undefined,
            logo_url: null,
          },
        },
        {
          entityType: 'schedule',
          action: 'create',
          channelName: 'Vorterix',
          programName: 'Demo Show',
          before: null,
          after: {
            day_of_week: 'monday',
            start_time: '10:00',
            end_time: '12:00',
          },
        },
      ]);
    });
    
  });

  describe('insertGelatinaSchedule', () => {
    it('should scrape and insert Gelatina schedule', async () => {
      jest.spyOn(GelatinaModule, 'scrapeGelatinaSchedule').mockResolvedValue([
        {
          name: 'Gelatina Show',
          days: ['martes'],
          startTime: '14:00',
          endTime: '16:00',
          logoUrl: 'https://example.com/logo.png',
        },
      ]);

      mockChannelRepo.findOne.mockResolvedValue(null);
      mockChannelRepo.create.mockReturnValue({ name: 'Gelatina' });
      mockChannelRepo.save.mockResolvedValue({ id: 2, name: 'Gelatina' });

      mockProgramRepo.findOne.mockResolvedValue(null);
      mockProgramRepo.find.mockResolvedValue([]); // No existing programs found
      mockProgramRepo.create.mockReturnValue({ name: 'Gelatina Show' });
      mockProgramRepo.save.mockResolvedValue({ id: 2, name: 'Gelatina Show' });

      mockScheduleRepo.findOne.mockResolvedValue(null);
      mockScheduleRepo.save.mockResolvedValue({});

      const result = await service.insertGelatinaSchedule();
      expect(result).toEqual({ success: true });
    });
  });

  describe('insertUrbanaSchedule', () => {
    it('should scrape and insert Urbana schedule', async () => {
      jest.spyOn(UrbanaModule, 'scrapeUrbanaPlaySchedule').mockResolvedValue([
        {
          name: 'Urbana Show',
          days: ['miércoles'],
          startTime: '08.00',
          endTime: '10.00',
          logoUrl: null,
        },
      ]);

      mockChannelRepo.findOne.mockResolvedValue(null);
      mockChannelRepo.create.mockReturnValue({ name: 'Urbana Play' });
      mockChannelRepo.save.mockResolvedValue({ id: 3, name: 'Urbana Play' });

      mockProgramRepo.findOne.mockResolvedValue(null);
      mockProgramRepo.find.mockResolvedValue([]); // No existing programs found
      mockProgramRepo.create.mockReturnValue({ name: 'Urbana Show' });
      mockProgramRepo.save.mockResolvedValue({ id: 3, name: 'Urbana Show' });

      mockScheduleRepo.findOne.mockResolvedValue(null);
      mockScheduleRepo.save.mockResolvedValue({});

      const result = await service.insertUrbanaSchedule();
      expect(result).toEqual({ success: true });
    });
  });
});
