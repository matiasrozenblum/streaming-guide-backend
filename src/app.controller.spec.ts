import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { Channel } from './channels/channels.entity';
import { Program } from './programs/programs.entity';
import { Schedule } from './schedules/schedules.entity';
import { Panelist } from './panelists/panelists.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { YoutubeDiscoveryService } from './youtube/youtube-discovery.service';

describe('AppController', () => {
  let controller: AppController;
  let channelRepo: Repository<Channel>;
  let programRepo: Repository<Program>;
  let scheduleRepo: Repository<Schedule>;
  let panelistRepo: Repository<Panelist>;

  const mockChannelRepo = {
    find: jest.fn(),
    save: jest.fn(),
  };

  const mockProgramRepo = {
    save: jest.fn(),
  };

  const mockScheduleRepo = {
    save: jest.fn(),
  };

  const mockPanelistRepo = {
    save: jest.fn(),
  };

  const mockDataSource = {
    // Mock vacío si no se usa directamente
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        { provide: getRepositoryToken(Channel), useValue: mockChannelRepo },
        { provide: getRepositoryToken(Program), useValue: mockProgramRepo },
        { provide: getRepositoryToken(Schedule), useValue: mockScheduleRepo },
        { provide: getRepositoryToken(Panelist), useValue: mockPanelistRepo },
        { provide: DataSource, useValue: mockDataSource },
        { provide: YoutubeDiscoveryService, useValue: { getChannelIdsFromLiveUrls: jest.fn() } },
      ],
    }).compile();

    controller = module.get<AppController>(AppController);
    channelRepo = module.get(getRepositoryToken(Channel));
    programRepo = module.get(getRepositoryToken(Program));
    scheduleRepo = module.get(getRepositoryToken(Schedule));
    panelistRepo = module.get(getRepositoryToken(Panelist));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should seed only if channels do not exist', async () => {
    // Simular que no existen los canales
    mockChannelRepo.find.mockResolvedValue([]);

    mockChannelRepo.save.mockImplementation((data) => Promise.resolve({ id: 1, ...data }));
    mockProgramRepo.save.mockImplementation((data) => Promise.resolve({ id: Math.random(), ...data }));
    mockPanelistRepo.save.mockImplementation((data) => Promise.resolve(data));
    mockScheduleRepo.save.mockResolvedValue(true);

    const response = await controller.seed();

    expect(mockChannelRepo.find).toHaveBeenCalled();
    expect(mockChannelRepo.save).toHaveBeenCalledTimes(2); // Bondi y La Casa
    expect(mockProgramRepo.save).toHaveBeenCalled();
    expect(mockScheduleRepo.save).toHaveBeenCalled();

    expect(response).toEqual({
      message: 'Seed completed for Bondi Live and La Casa Streaming (only if not already present).',
    });
  });

  it('should not seed if both channels already exist', async () => {
    mockChannelRepo.find.mockResolvedValue([
      { id: 1, name: 'Bondi Live' },
      { id: 2, name: 'La Casa Streaming' },
    ]);

    const response = await controller.seed();

    expect(mockChannelRepo.save).not.toHaveBeenCalled();
    expect(mockProgramRepo.save).not.toHaveBeenCalled();
    expect(mockScheduleRepo.save).not.toHaveBeenCalled();

    expect(response).toEqual({
      message: 'Seed completed for Bondi Live and La Casa Streaming (only if not already present).',
    });
  });
});
