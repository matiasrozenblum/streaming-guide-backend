import { Test, TestingModule } from '@nestjs/testing';
import { ScraperController } from './scraper.controller';
import { ScraperService } from './scraper.service';

describe('ScraperController', () => {
  let controller: ScraperController;
  let service: ScraperService;

  const mockScraperService = {
    insertVorterixSchedule: jest.fn().mockResolvedValue('vorterix inserted'),
    insertGelatinaSchedule: jest.fn().mockResolvedValue('gelatina inserted'),
    insertUrbanaSchedule: jest.fn().mockResolvedValue('urbana inserted'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScraperController],
      providers: [
        {
          provide: ScraperService,
          useValue: mockScraperService,
        },
      ],
    }).compile();

    controller = module.get<ScraperController>(ScraperController);
    service = module.get<ScraperService>(ScraperService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call insertVorterixSchedule()', async () => {
    const result = await controller.insertVorterixSchedule();
    expect(service.insertVorterixSchedule).toHaveBeenCalled();
    expect(result).toBe('vorterix inserted');
  });

  it('should call insertGelatinaSchedule()', async () => {
    const result = await controller.insertGelatinaSchedule();
    expect(service.insertGelatinaSchedule).toHaveBeenCalled();
    expect(result).toBe('gelatina inserted');
  });

  it('should call insertUrbanaSchedule()', async () => {
    const result = await controller.scrapeUrbanaPlaySchedule();
    expect(service.insertUrbanaSchedule).toHaveBeenCalled();
    expect(result).toBe('urbana inserted');
  });
});
