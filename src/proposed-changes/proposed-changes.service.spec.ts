import { Test, TestingModule } from '@nestjs/testing';
import { ProposedChangesService } from './proposed-changes.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProposedChange } from './proposed-changes.entity';
import { Program } from '../programs/programs.entity';
import { Schedule } from '../schedules/schedules.entity';

describe('ProposedChangesService', () => {
  let service: ProposedChangesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProposedChangesService,
        {
          provide: getRepositoryToken(ProposedChange),
          useValue: {
            // Mock repository methods here
            find: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn(),
            remove: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Program),
          useValue: {
            // Mock repository methods here
            find: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Schedule),
          useValue: {
            // Mock repository methods here
            find: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ProposedChangesService>(ProposedChangesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
