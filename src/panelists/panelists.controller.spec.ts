import { Test, TestingModule } from '@nestjs/testing';
import { PanelistsController } from './panelists.controller';
import { PanelistsService } from './panelists.service';
import { CreatePanelistDto } from './dto/create-panelist.dto';
import { Panelist } from './panelists.entity';

describe('PanelistsController', () => {
  let controller: PanelistsController;
  let service: PanelistsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PanelistsController],
      providers: [
        {
          provide: PanelistsService,
          useValue: {
            findAll: jest.fn().mockResolvedValue([{ name: 'Panelista 1', bio: 'Biografía del panelista' }]),
            findOne: jest.fn().mockResolvedValue({ name: 'Panelista 1', bio: 'Biografía del panelista' }),
            create: jest.fn().mockResolvedValue({ name: 'Panelista 1', bio: 'Biografía del panelista' }),
            remove: jest.fn().mockResolvedValue(null),
          },
        },
      ],
    }).compile();

    controller = module.get<PanelistsController>(PanelistsController);
    service = module.get<PanelistsService>(PanelistsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return an array of panelists', async () => {
    const result = await controller.findAll();
    expect(result).toEqual([{ name: 'Panelista 1', bio: 'Biografía del panelista' }]);
  });

  it('should return a single panelist', async () => {
    const result = await controller.findOne('1');
    expect(result).toEqual({ name: 'Panelista 1', bio: 'Biografía del panelista' });
  });

  it('should create a new panelist', async () => {
    const createPanelistDto: CreatePanelistDto = { name: 'Panelista 1', bio: 'Biografía del panelista' };
    const result = await controller.create(createPanelistDto);
    expect(result).toEqual({ name: 'Panelista 1', bio: 'Biografía del panelista' });
  });

  it('should delete a panelist', async () => {
    const result = await controller.remove('1');
    expect(result).toBeNull();
  });
});