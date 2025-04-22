import { Test, TestingModule } from '@nestjs/testing';
import { PanelistsService } from './panelists.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Panelist } from './panelists.entity';
import { Program } from '../programs/programs.entity';
import { CreatePanelistDto } from './dto/create-panelist.dto';
import { UpdatePanelistDto } from './dto/update-panelist.dto';
import { RedisService } from '../redis/redis.service';
import { NotFoundException } from '@nestjs/common';

describe('PanelistsService', () => {
  let service: PanelistsService;
  let panelistRepository: Partial<any>;
  let programRepository: Partial<any>;
  let redisService: RedisService;

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
      findOne: jest.fn().mockImplementation(({ where }) => {
        return where.id === 1 ? Promise.resolve(mockPanelist) : Promise.resolve(null);
      }),
      create: jest.fn().mockReturnValue(mockPanelist),
      save: jest.fn().mockResolvedValue(mockPanelist),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    programRepository = {
      findOne: jest.fn(),
    };

    redisService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    } as any;

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
          provide: RedisService,
          useValue: redisService,
        },
      ],
    }).compile();

    service = module.get<PanelistsService>(PanelistsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return panelists from cache if available', async () => {
      (redisService.get as jest.Mock).mockResolvedValueOnce([mockPanelist]);
      const result = await service.findAll();
      expect(result).toEqual([mockPanelist]);
      expect(redisService.get).toHaveBeenCalledWith('panelists:all');
    });
  });

  describe('findOne', () => {
    it('should return a panelist by id', async () => {
      const result = await service.findOne(1);
      expect(result).toEqual(mockPanelist);
    });

    it('should throw NotFoundException if panelist not found', async () => {
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
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
    });
  });
});
