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
  };

  const mockChannelsService = {
    findAll: jest.fn().mockResolvedValue([mockChannel]),
    findOne: jest.fn().mockResolvedValue(mockChannel),
    create: jest.fn().mockResolvedValue(mockChannel),
    update: jest.fn().mockResolvedValue(mockChannel),
    remove: jest.fn().mockResolvedValue(undefined),
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
      };

      const result = await controller.update(1, updateDto);
      expect(result).toEqual(mockChannel);
      expect(service.update).toHaveBeenCalledWith(1, updateDto);
    });

    it('should handle partial updates', async () => {
      const updateDto: UpdateChannelDto = {
        name: 'Updated Channel',
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
});