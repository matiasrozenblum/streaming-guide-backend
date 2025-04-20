import { Test, TestingModule } from '@nestjs/testing';
import { ProposedChangesService } from './proposed-changes.service';

describe('ProposedChangesService', () => {
  let service: ProposedChangesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProposedChangesService],
    }).compile();

    service = module.get<ProposedChangesService>(ProposedChangesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
