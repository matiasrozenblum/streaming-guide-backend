import { Test, TestingModule } from '@nestjs/testing';
import { PanelistsController } from './panelists.controller';
import { PanelistsService } from './panelists.service';
import { CreatePanelistDto } from './dto/create-panelist.dto';
import { UpdatePanelistDto } from './dto/update-panelist.dto';
import { Panelist } from './panelists.entity';
import { NotFoundException } from '@nestjs/common';

describe('PanelistsController', () => {
  let controller: PanelistsController;
  let service: PanelistsService;

  const mockPanelist: Panelist = {
    id: 1,
    name: 'Test Panelist',
    bio: 'Test Bio',
    photo_url: null,
    programs: [],
  };

  const mockPanelistsService = {
    findAll: jest.fn().mockResolvedValue([mockPanelist]),
    findOne: jest.fn().mockImplementation((id) => {
      if (id === 1) {
        return Promise.resolve(mockPanelist);
      }
      return Promise.reject(new NotFoundException());
    }),
    findByProgram: jest.fn().mockResolvedValue([mockPanelist]),
    create: jest.fn().mockResolvedValue(mockPanelist),
    update: jest.fn().mockResolvedValue(mockPanelist),
    remove: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PanelistsController],
      providers: [
        {
          provide: PanelistsService,
          useValue: mockPanelistsService,
        },
      ],
    }).compile();

    controller = module.get<PanelistsController>(PanelistsController);
    service = module.get<PanelistsService>(PanelistsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return an array of panelists', async () => {
      const result = await controller.findAll();
      expect(result).toEqual([mockPanelist]);
      expect(service.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a panelist by id', async () => {
      const result = await controller.findOne(1);
      expect(result).toEqual(mockPanelist);
      expect(service.findOne).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundException if panelist not found', async () => {
      await expect(controller.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByProgram', () => {
    it('should return panelists for a program', async () => {
      const result = await controller.findByProgram('1');
      expect(result).toEqual([mockPanelist]);
      expect(service.findByProgram).toHaveBeenCalledWith('1');
    });
  });

  describe('create', () => {
    it('should create a new panelist', async () => {
      const createPanelistDto: CreatePanelistDto = {
        name: 'Test Panelist',
        bio: 'Test Bio',
      };

      const result = await controller.create(createPanelistDto);
      expect(result).toEqual(mockPanelist);
      expect(service.create).toHaveBeenCalledWith(createPanelistDto);
    });
  });

  describe('update', () => {
    it('should update a panelist', async () => {
      const updatePanelistDto: UpdatePanelistDto = {
        name: 'Updated Panelist',
      };

      const result = await controller.update('1', updatePanelistDto);
      expect(result).toEqual(mockPanelist);
      expect(service.update).toHaveBeenCalledWith('1', updatePanelistDto);
    });

    it('should throw NotFoundException when updating non-existent panelist', async () => {
      mockPanelistsService.update.mockRejectedValueOnce(new NotFoundException());
      const updatePanelistDto: UpdatePanelistDto = {
        name: 'Updated Panelist',
      };
      await expect(controller.update('999', updatePanelistDto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should remove a panelist', async () => {
      await controller.remove('1');
      expect(service.remove).toHaveBeenCalledWith('1');
    });

    it('should throw NotFoundException when removing non-existent panelist', async () => {
      mockPanelistsService.remove.mockResolvedValueOnce(false);
      await expect(controller.remove('999')).rejects.toThrow(NotFoundException);
    });
  });
});