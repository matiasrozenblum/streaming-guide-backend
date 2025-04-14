import { Test, TestingModule } from '@nestjs/testing';
import { PanelistsService } from './panelists.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Panelist } from './panelists.entity';
import { Program } from '../programs/programs.entity';
import { CreatePanelistDto } from './dto/create-panelist.dto';
import { UpdatePanelistDto } from './dto/update-panelist.dto';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { NotFoundException } from '@nestjs/common';
import { Repository, UpdateResult, DeleteResult } from 'typeorm';

describe('PanelistsService', () => {
  let service: PanelistsService;
  let panelistRepository: Partial<Repository<Panelist>>;
  let programRepository: Partial<Repository<Program>>;
  let cacheManager: any;

  const mockPanelist = {
    id: 1,
    name: 'Test Panelist',
    bio: 'Test Bio',
    photo_url: 'test.jpg',
    programs: [],
  };

  beforeEach(async () => {
    panelistRepository = {
      find: jest.fn().mockResolvedValue([mockPanelist]),
      findOne: jest.fn().mockImplementation(({ where: { id } }) => {
        if (id === 1) {
          return Promise.resolve(mockPanelist);
        }
        return Promise.resolve(null);
      }),
      create: jest.fn().mockReturnValue(mockPanelist),
      save: jest.fn().mockResolvedValue(mockPanelist),
      delete: jest.fn().mockResolvedValue({ affected: 1, raw: [] } as DeleteResult),
    };

    programRepository = {
      findOne: jest.fn(),
    };

    cacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PanelistsService,
        {
          provide: getRepositoryToken(Panelist),
          useValue: panelistRepository,
        },
        {
          provide: getRepositoryToken(Program),
          useValue: programRepository,
        },
        {
          provide: CACHE_MANAGER,
          useValue: cacheManager,
        },
      ],
    }).compile();

    service = module.get<PanelistsService>(PanelistsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return an array of panelists', async () => {
      const result = await service.findAll();
      expect(result).toEqual([mockPanelist]);
      expect(panelistRepository.find).toHaveBeenCalled();
    });

    it('should return cached panelists if available', async () => {
      cacheManager.get.mockResolvedValueOnce([mockPanelist]);
      const result = await service.findAll();
      expect(result).toEqual([mockPanelist]);
      expect(cacheManager.get).toHaveBeenCalledWith('panelists:all');
      expect(panelistRepository.find).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a panelist by id', async () => {
      const result = await service.findOne('1');
      expect(result).toEqual(mockPanelist);
      expect(panelistRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
        relations: ['programs'],
        loadEagerRelations: true,
      });
    });

    it('should throw NotFoundException if panelist not found', async () => {
      jest.spyOn(panelistRepository, 'findOne').mockResolvedValueOnce(null);
      await expect(service.findOne('999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a new panelist', async () => {
      const createPanelistDto: CreatePanelistDto = {
        name: 'New Panelist',
        bio: 'New Bio',
      };

      const result = await service.create(createPanelistDto);
      expect(result).toEqual(mockPanelist);
      expect(panelistRepository.create).toHaveBeenCalledWith(createPanelistDto);
      expect(panelistRepository.save).toHaveBeenCalled();
      expect(cacheManager.del).toHaveBeenCalledWith('panelists:all');
    });
  });

  describe('update', () => {
    it('should update a panelist', async () => {
      const updatePanelistDto: UpdatePanelistDto = {
        name: 'Updated Panelist',
      };

      // Mock findOne to return the panelist
      jest.spyOn(panelistRepository, 'findOne').mockResolvedValueOnce(mockPanelist);
      
      const result = await service.update('1', updatePanelistDto);
      expect(result).toEqual(mockPanelist);
      expect(panelistRepository.save).toHaveBeenCalledWith(mockPanelist);
      expect(panelistRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
        relations: ['programs'],
        loadEagerRelations: true,
      });
      expect(cacheManager.del).toHaveBeenCalledWith('panelists:all');
      expect(cacheManager.del).toHaveBeenCalledWith('panelists:1');
    });

    it('should throw NotFoundException if panelist not found', async () => {
      jest.spyOn(panelistRepository, 'findOne').mockResolvedValueOnce(null);
      await expect(service.update('999', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should remove a panelist', async () => {
      const result = await service.remove('1');
      expect(result).toBe(true);
      expect(panelistRepository.delete).toHaveBeenCalledWith('1');
      expect(cacheManager.del).toHaveBeenCalledWith('panelists:all');
      expect(cacheManager.del).toHaveBeenCalledWith('panelists:1');
    });

    it('should return false if panelist not found', async () => {
      jest.spyOn(panelistRepository, 'delete').mockResolvedValueOnce({ affected: 0, raw: [] } as DeleteResult);
      const result = await service.remove('999');
      expect(result).toBe(false);
      expect(panelistRepository.delete).toHaveBeenCalledWith('999');
    });
  });
});
