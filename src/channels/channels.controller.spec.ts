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
            findAll: jest.fn().mockResolvedValue([{ name: 'Canal 1', description: 'Descripción del canal' }]),
            findOne: jest.fn().mockResolvedValue({ name: 'Canal 1', description: 'Descripción del canal' }),
            create: jest.fn().mockResolvedValue({ name: 'Canal 1', description: 'Descripción del canal' }),
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
    expect(result).toEqual([{ name: 'Canal 1', description: 'Descripción del canal' }]);
  });

  it('should return a single channel', async () => {
    const result = await controller.findOne('1');
    expect(result).toEqual({ name: 'Canal 1', description: 'Descripción del canal' });
  });

  it('should create a new channel', async () => {
    const createChannelDto: CreateChannelDto = { name: 'Canal 1', description: 'Descripción del canal' };
    const result = await controller.create(createChannelDto);
    expect(result).toEqual({ name: 'Canal 1', description: 'Descripción del canal' });
  });

  it('should delete a channel', async () => {
    const result = await controller.remove('1');
    expect(result).toBeNull();
  });
});