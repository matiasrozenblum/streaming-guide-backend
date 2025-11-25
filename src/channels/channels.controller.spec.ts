import { Test, TestingModule } from '@nestjs/testing';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { Channel } from './channels.entity';
import { NotFoundException } from '@nestjs/common';

describe('ChannelsController', () => {
  let controller: ChannelsController;
  let service: ChannelsService;

  const mockChannel: Channel = {
    id: 1,
    name: 'Test Channel',
    handle: 'test',
    logo_url: 'https://test.com/logo.png',
    description: 'Test Description',
    programs: [],
    youtube_channel_id: 'test-channel-id',
    order: 1,
    is_visible: true,
    background_color: null,
    show_only_when_scheduled: false,
    categories: [],
  };

  const mockChannelsService = {
    findAll: jest.fn().mockResolvedValue([mockChannel]),
    findOne: jest.fn().mockResolvedValue(mockChannel),
    create: jest.fn().mockResolvedValue(mockChannel),
    update: jest.fn().mockResolvedValue(mockChannel),
    remove: jest.fn().mockResolvedValue(undefined),
    getChannelsWithSchedules: jest.fn().mockResolvedValue([]),
    getTodaySchedules: jest.fn().mockResolvedValue([]),
    getWeekSchedules: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChannelsController],
      providers: [
        {
          provide: ChannelsService,
          useValue: mockChannelsService,
        },
      ],
    }).compile();

    controller = module.get<ChannelsController>(ChannelsController);
    service = module.get<ChannelsService>(ChannelsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return an array of channels', async () => {
      const result = await controller.findAll();
      expect(result).toEqual([mockChannel]);
      expect(service.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a single channel', async () => {
      const result = await controller.findOne(1);
      expect(result).toEqual(mockChannel);
      expect(service.findOne).toHaveBeenCalledWith(1);
    });
  });

  describe('create', () => {
    it('should create a new channel', async () => {
      const createDto: CreateChannelDto = {
        name: 'New Channel',
        handle: 'new-stream',
        logo_url: 'https://test.com/new-logo.png',
        description: 'New Description',
        youtube_fetch_enabled: true,
        youtube_fetch_override_holiday: true,
      };

      const result = await controller.create(createDto);
      expect(result).toEqual(mockChannel);
      expect(service.create).toHaveBeenCalledWith(createDto);
    });
  });

  describe('update', () => {
    it('should update a channel', async () => {
      const updateDto: UpdateChannelDto = {
        name: 'Updated Channel',
        description: 'Updated Description',
        youtube_fetch_enabled: true,
        youtube_fetch_override_holiday: true,
      };

      const result = await controller.update(1, updateDto);
      expect(result).toEqual(mockChannel);
      expect(service.update).toHaveBeenCalledWith(1, updateDto);
    });

    it('should handle partial updates', async () => {
      const updateDto: UpdateChannelDto = {
        name: 'Updated Channel',
        youtube_fetch_enabled: true,
        youtube_fetch_override_holiday: true,
      };

      const result = await controller.update(1, updateDto);
      expect(result).toEqual(mockChannel);
      expect(service.update).toHaveBeenCalledWith(1, updateDto);
    });
  });

  describe('remove', () => {
    it('should remove a channel', async () => {
      const result = await controller.remove(1);
      expect(result).toBeUndefined();
      expect(service.remove).toHaveBeenCalledWith(1);
    });
  });

  describe('getChannelsWithSchedules', () => {
    it('should call service with correct parameters', async () => {
      const result = await controller.getChannelsWithSchedules('monday', 'device123', 'true', 'false');
      
      expect(result).toEqual([]);
      expect(service.getChannelsWithSchedules).toHaveBeenCalledWith('monday', 'device123', true, 'false');
    });

    it('should handle undefined parameters', async () => {
      const result = await controller.getChannelsWithSchedules();
      
      expect(result).toEqual([]);
      expect(service.getChannelsWithSchedules).toHaveBeenCalledWith(undefined, undefined, undefined, undefined);
    });

    it('should handle partial parameters', async () => {
      const result = await controller.getChannelsWithSchedules('tuesday', undefined, 'false');
      
      expect(result).toEqual([]);
      expect(service.getChannelsWithSchedules).toHaveBeenCalledWith('tuesday', undefined, false, undefined);
    });
  });

  describe('getTodaySchedules', () => {
    it('should call getTodaySchedules service method', async () => {
      const result = await controller.getTodaySchedules('device123', 'true', 'false');
      
      expect(result).toEqual([]);
      expect(service.getTodaySchedules).toHaveBeenCalledWith('device123', true, 'false');
    });

    it('should handle undefined parameters', async () => {
      const result = await controller.getTodaySchedules();
      
      expect(result).toEqual([]);
      expect(service.getTodaySchedules).toHaveBeenCalledWith(undefined, undefined, undefined);
    });

    it('should handle partial parameters', async () => {
      const result = await controller.getTodaySchedules('device456', 'true');
      
      expect(result).toEqual([]);
      expect(service.getTodaySchedules).toHaveBeenCalledWith('device456', true, undefined);
    });
  });

  describe('getWeekSchedules', () => {
    it('should call getWeekSchedules service method', async () => {
      const result = await controller.getWeekSchedules('device123', 'true', 'false');
      
      expect(result).toEqual([]);
      expect(service.getWeekSchedules).toHaveBeenCalledWith('device123', true, 'false');
    });

    it('should handle undefined parameters', async () => {
      const result = await controller.getWeekSchedules();
      
      expect(result).toEqual([]);
      expect(service.getWeekSchedules).toHaveBeenCalledWith(undefined, undefined, undefined);
    });

    it('should handle partial parameters', async () => {
      const result = await controller.getWeekSchedules('device789', 'false');
      
      expect(result).toEqual([]);
      expect(service.getWeekSchedules).toHaveBeenCalledWith('device789', false, undefined);
    });
  });
});