import { Test, TestingModule } from '@nestjs/testing';
import { PanelistsService } from './panelists.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Panelist } from './panelists.entity';
import { Program } from '../programs/programs.entity';
import { CreatePanelistDto } from './dto/create-panelist.dto';
import { UpdatePanelistDto } from './dto/update-panelist.dto';
import { RedisService } from '../redis/redis.service';
import { NotFoundException } from '@nestjs/common';
import { NotifyAndRevalidateUtil } from '../utils/notify-and-revalidate.util';

describe('PanelistsService', () => {
  let service: PanelistsService;
  let panelistRepository: Partial<any>;
  let programRepository: Partial<any>;
  let redisService: RedisService;
  let notifyUtil: NotifyAndRevalidateUtil;

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
      delByPattern: jest.fn(),
      client: {},
      incr: jest.fn(),
    } as any;

    notifyUtil = new NotifyAndRevalidateUtil(
      redisService as any,
      'https://frontend.test',
      'testsecret'
    );

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
    service['notifyUtil'] = notifyUtil;
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

  describe('notifyAndRevalidate integration', () => {
    it('calls notifyAndRevalidate on create', async () => {
      const spy = jest.spyOn(notifyUtil, 'notifyAndRevalidate').mockResolvedValue(undefined as any);
      jest.spyOn(panelistRepository, 'create').mockReturnValue({ id: 1 } as any);
      jest.spyOn(panelistRepository, 'save').mockResolvedValue({ id: 1 } as any);
      await service.create({ name: 'Test' });
      expect(spy).toHaveBeenCalled();
    });
    it('calls notifyAndRevalidate on update', async () => {
      const spy = jest.spyOn(notifyUtil, 'notifyAndRevalidate').mockResolvedValue(undefined as any);
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 1 } as any);
      jest.spyOn(panelistRepository, 'save').mockResolvedValue({ id: 1 } as any);
      await service.update('1', { name: 'Updated' });
      expect(spy).toHaveBeenCalled();
    });
    it('calls notifyAndRevalidate on remove', async () => {
      const spy = jest.spyOn(notifyUtil, 'notifyAndRevalidate').mockResolvedValue(undefined as any);
      jest.spyOn(panelistRepository, 'delete').mockResolvedValue({ affected: 1 } as any);
      await service.remove('1');
      expect(spy).toHaveBeenCalled();
    });
    it('calls notifyAndRevalidate on addToProgram', async () => {
      const spy = jest.spyOn(notifyUtil, 'notifyAndRevalidate').mockResolvedValue(undefined as any);
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 1, programs: [] } as any);
      jest.spyOn(programRepository, 'findOne').mockResolvedValue({ id: 2 } as any);
      jest.spyOn(panelistRepository, 'save').mockResolvedValue({ id: 1, programs: [{ id: 2 }] } as any);
      jest.spyOn(redisService, 'del').mockResolvedValue(undefined as any);
      jest.spyOn(redisService, 'delByPattern').mockResolvedValue(undefined as any);
      await service.addToProgram(1, 2);
      expect(spy).toHaveBeenCalled();
    });
    it('calls notifyAndRevalidate on removeFromProgram', async () => {
      const spy = jest.spyOn(notifyUtil, 'notifyAndRevalidate').mockResolvedValue(undefined as any);
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 1, programs: [{ id: 2 }] } as any);
      jest.spyOn(panelistRepository, 'save').mockResolvedValue({ id: 1, programs: [] } as any);
      jest.spyOn(redisService, 'del').mockResolvedValue(undefined as any);
      jest.spyOn(redisService, 'delByPattern').mockResolvedValue(undefined as any);
      await service.removeFromProgram(1, 2);
      expect(spy).toHaveBeenCalled();
    });
  });
});
