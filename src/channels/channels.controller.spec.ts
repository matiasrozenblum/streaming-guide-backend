import { Test, TestingModule } from '@nestjs/testing';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { Channel } from './channels.entity';

describe('ChannelsController', () => {
  let controller: ChannelsController;
  let service: ChannelsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChannelsController],
      providers: [
        {
          provide: ChannelsService,
          useValue: {
            findAll: jest.fn().mockResolvedValue([{ name: 'Canal 1', description: 'Descripción del canal', logo_url: 'https://logo1.png', streaming_url: 'https://stream1.com' }]),
            findOne: jest.fn().mockResolvedValue({ name: 'Canal 1', description: 'Descripción del canal', logo_url: 'https://logo1.png', streaming_url: 'https://stream1.com' }),
            create: jest.fn().mockResolvedValue({ name: 'Canal 1', description: 'Descripción del canal', logo_url: 'https://logo1.png', streaming_url: 'https://stream1.com' }),
            remove: jest.fn().mockResolvedValue(null),
          },
        },
      ],
    }).compile();

    controller = module.get<ChannelsController>(ChannelsController);
    service = module.get<ChannelsService>(ChannelsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return an array of channels', async () => {
    const result = await controller.findAll();
    expect(result).toEqual([{ name: 'Canal 1', description: 'Descripción del canal', logo_url: 'https://logo1.png', streaming_url: 'https://stream1.com' }]);
  });

  it('should return a single channel', async () => {
    const result = await controller.findOne('1');
    expect(result).toEqual({ name: 'Canal 1', description: 'Descripción del canal', logo_url: 'https://logo1.png', streaming_url: 'https://stream1.com' });
  });

  it('should create a new channel', async () => {
    const createChannelDto: CreateChannelDto = { name: 'Canal 1', description: 'Descripción del canal', logo_url: 'https://logo1.png', streaming_url: 'https://stream1.com' };
    const result = await controller.create(createChannelDto);
    expect(result).toEqual({ name: 'Canal 1', description: 'Descripción del canal', logo_url: 'https://logo1.png', streaming_url: 'https://stream1.com' });
  });

  it('should delete a channel', async () => {
    const result = await controller.remove('1');
    expect(result).toBeNull();
  });
});