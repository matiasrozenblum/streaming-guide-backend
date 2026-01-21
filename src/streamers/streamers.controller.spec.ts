import { Test, TestingModule } from '@nestjs/testing';
import { StreamersController } from './streamers.controller';
import { StreamersService } from './streamers.service';
import { SupabaseStorageService } from '../banners/supabase-storage.service';
import { CreateStreamerDto, StreamingService } from './dto/create-streamer.dto';
import { UpdateStreamerDto } from './dto/update-streamer.dto';
import { Streamer } from './streamers.entity';
import { NotFoundException } from '@nestjs/common';

describe('StreamersController', () => {
  let controller: StreamersController;
  let service: StreamersService;

  const mockStreamer: Streamer = {
    id: 1,
    name: 'Test Streamer',
    logo_url: 'https://test.com/logo.png',
    is_visible: true,
    order: 1,
    services: [
      {
        service: StreamingService.TWITCH,
        url: 'https://twitch.tv/test',
        username: 'test',
      },
    ],
    categories: [],
  };

  const mockStreamersService = {
    findAll: jest.fn().mockResolvedValue([mockStreamer]),
    findAllVisible: jest.fn().mockResolvedValue([mockStreamer]),
    findAllVisibleWithLiveStatus: jest.fn().mockResolvedValue([{ ...mockStreamer, is_live: false }]),
    findOne: jest.fn().mockResolvedValue(mockStreamer),
    create: jest.fn().mockResolvedValue(mockStreamer),
    update: jest.fn().mockResolvedValue(mockStreamer),
    remove: jest.fn().mockResolvedValue(undefined),
  };

  const mockSupabaseStorageService = {
    uploadImage: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StreamersController],
      providers: [
        {
          provide: StreamersService,
          useValue: mockStreamersService,
        },
        {
          provide: SupabaseStorageService,
          useValue: mockSupabaseStorageService,
        },
      ],
    }).compile();

    controller = module.get<StreamersController>(StreamersController);
    service = module.get<StreamersService>(StreamersService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return an array of streamers', async () => {
      const result = await controller.findAll();
      expect(result).toEqual([mockStreamer]);
      expect(service.findAll).toHaveBeenCalled();
    });
  });

  describe('findAllVisible', () => {
    it('should return an array of visible streamers with live status', async () => {
      const result = await controller.findAllVisible();
      expect(result).toEqual([{ ...mockStreamer, is_live: false }]);
      expect(service.findAllVisibleWithLiveStatus).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a single streamer', async () => {
      const result = await controller.findOne(1);
      expect(result).toEqual(mockStreamer);
      expect(service.findOne).toHaveBeenCalledWith(1);
    });
  });

  describe('create', () => {
    it('should create a new streamer', async () => {
      const createDto: CreateStreamerDto = {
        name: 'New Streamer',
        logo_url: 'https://test.com/new-logo.png',
        services: [
          {
            service: StreamingService.TWITCH,
            url: 'https://twitch.tv/new',
            username: 'new',
          },
        ],
      };

      const result = await controller.create(createDto);
      expect(result).toEqual(mockStreamer);
      expect(service.create).toHaveBeenCalledWith(createDto);
    });
  });

  describe('update', () => {
    it('should update a streamer', async () => {
      const updateDto: UpdateStreamerDto = {
        name: 'Updated Streamer',
        is_visible: false,
      };

      const result = await controller.update(1, updateDto);
      expect(result).toEqual(mockStreamer);
      expect(service.update).toHaveBeenCalledWith(1, updateDto);
    });

    it('should handle partial updates', async () => {
      const updateDto: UpdateStreamerDto = {
        name: 'Updated Streamer',
      };

      const result = await controller.update(1, updateDto);
      expect(result).toEqual(mockStreamer);
      expect(service.update).toHaveBeenCalledWith(1, updateDto);
    });
  });

  describe('remove', () => {
    it('should remove a streamer', async () => {
      const result = await controller.remove(1);
      expect(result).toBeUndefined();
      expect(service.remove).toHaveBeenCalledWith(1);
    });
  });
});

