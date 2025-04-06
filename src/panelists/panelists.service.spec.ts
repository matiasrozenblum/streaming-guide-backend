import { Test, TestingModule } from '@nestjs/testing';
import { PanelistsService } from './panelists.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Panelist } from './panelists.entity';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { CreatePanelistDto } from './dto/create-panelist.dto';

describe('PanelistsService', () => {
  let service: PanelistsService;
  let repo: Repository<Panelist>;

  const mockPanelists: Panelist[] = [
    { id: 1, name: 'Juan Pérez', programs: [] },
    { id: 2, name: 'Ana Gómez', programs: [] },
  ];

  const mockRepository = {
    find: jest.fn().mockResolvedValue(mockPanelists),
    findOne: jest.fn().mockImplementation(({ where: { id } }) =>
      Promise.resolve(mockPanelists.find(p => p.id === id))
    ),
    create: jest.fn().mockImplementation((dto) => ({ id: 3, ...dto, programs: [] })),
    save: jest.fn().mockImplementation(panelist => Promise.resolve(panelist)),
    delete: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PanelistsService,
        {
          provide: getRepositoryToken(Panelist),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<PanelistsService>(PanelistsService);
    repo = module.get<Repository<Panelist>>(getRepositoryToken(Panelist));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return all panelists', async () => {
    const result = await service.findAll();
    expect(result).toEqual(mockPanelists);
    expect(repo.find).toHaveBeenCalled();
  });

  it('should return a panelist by ID', async () => {
    const result = await service.findOne('1');
    expect(result).toEqual(mockPanelists[0]);
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
  });

  it('should throw NotFoundException if panelist not found', async () => {
    mockRepository.findOne.mockResolvedValueOnce(null);
    await expect(service.findOne('999')).rejects.toThrow(NotFoundException);
  });

  it('should create and save a panelist', async () => {
    const dto: CreatePanelistDto = {
      name: 'Nuevo Panelista',
    };

    const result = await service.create(dto);
    expect(result).toMatchObject({
      id: 3,
      name: 'Nuevo Panelista',
    });
    expect(repo.create).toHaveBeenCalledWith(dto);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining(dto));
  });

  it('should delete a panelist', async () => {
    await service.remove('1');
    expect(repo.delete).toHaveBeenCalledWith('1');
  });
});
