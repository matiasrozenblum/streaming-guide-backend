import { Test, TestingModule } from '@nestjs/testing';
import { ProposedChangesController } from './proposed-changes.controller';

describe('ProposedChangesController', () => {
  let controller: ProposedChangesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProposedChangesController],
    }).compile();

    controller = module.get<ProposedChangesController>(ProposedChangesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
