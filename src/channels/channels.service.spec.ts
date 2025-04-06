import { Test, TestingModule } from '@nestjs/testing';
import { ChannelsService } from './channels.service';
import { Channel } from './channels.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { CreateChannelDto } from './dto/create-channel.dto';

describe('ChannelsService', () => {
  let service: ChannelsService;
  let repo: Repository<Channel>;

  const mockChannels: Channel[] = [
    { id: 1, name: 'Luzu TV', logo_url: 'https://logo1.png', streaming_url: 'https://stream1.com', programs: [], description: 'Luzu TV is a streaming channel.' },
    { id: 2, name: 'Olga', logo_url: 'https://logo2.png', streaming_url: 'https://stream2.com', programs: [], description: 'Olga is a streaming channel.' },
  ];

  const mockRepository = {
    find: jest.fn().mockResolvedValue(mockChannels),
    findOne: jest.fn().mockImplementation(({ where: { id } }) =>
      Promise.resolve(mockChannels.find((c) => c.id === id)),
    ),
    create: jest.fn().mockImplementation((dto) => ({ id: 3, ...dto, programs: [] })),
    save: jest.fn().mockImplementation((channel) => Promise.resolve(channel)),
    delete: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChannelsService,
        {
          provide: getRepositoryToken(Channel),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<ChannelsService>(ChannelsService);
    repo = module.get<Repository<Channel>>(getRepositoryToken(Channel));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return all channels', async () => {
    const result = await service.findAll();
    expect(result).toEqual(mockChannels);
    expect(repo.find).toHaveBeenCalled();
  });

  it('should return a channel by ID', async () => {
    const result = await service.findOne('1');
    expect(result).toEqual(mockChannels[0]);
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
  });

  it('should throw NotFoundException if channel not found', async () => {
    mockRepository.findOne.mockResolvedValueOnce(null);
    await expect(service.findOne('999')).rejects.toThrow(NotFoundException);
  });

  it('should create and save a channel', async () => {
    const dto: CreateChannelDto = {
      name: 'Nueva Señal',
      description: 'This is a new channel.',
      logo_url: 'https://logo3.png',
      streaming_url: 'https://stream3.com',
    };

    const result = await service.create(dto);
    expect(result).toMatchObject({
      id: 3,
      ...dto,
    });
    expect(repo.create).toHaveBeenCalledWith(dto);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining(dto));
  });

  it('should delete a channel', async () => {
    await service.remove('1');
    expect(repo.delete).toHaveBeenCalledWith('1');
  });
});
