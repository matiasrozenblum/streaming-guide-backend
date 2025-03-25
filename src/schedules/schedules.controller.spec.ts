import { Test, TestingModule } from '@nestjs/testing';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { Schedule } from './schedules.entity';

describe('SchedulesController', () => {
  let controller: SchedulesController;
  let service: SchedulesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SchedulesController],
      providers: [
        {
          provide: SchedulesService,
          useValue: {
            findAll: jest.fn().mockResolvedValue([{ time: '10:00', programName: 'Programa 1', channelName: 'Canal 1' }]),
            findOne: jest.fn().mockResolvedValue({ time: '10:00', programName: 'Programa 1', channelName: 'Canal 1' }),
            create: jest.fn().mockResolvedValue({ time: '10:00', programName: 'Programa 1', channelName: 'Canal 1' }),
            remove: jest.fn().mockResolvedValue(null),
          },
        },
      ],
    }).compile();

    controller = module.get<SchedulesController>(SchedulesController);
    service = module.get<SchedulesService>(SchedulesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return an array of schedules', async () => {
    const result = await controller.findAll();
    expect(result).toEqual([{ time: '10:00', programName: 'Programa 1', channelName: 'Canal 1' }]);
  });

  it('should return a single schedule', async () => {
    const result = await controller.findOne('1');
    expect(result).toEqual({ time: '10:00', programName: 'Programa 1', channelName: 'Canal 1' });
  });

  it('should create a new schedule', async () => {
    const createScheduleDto: CreateScheduleDto = {
        startTime: '10:00',
        endTime: '12:00',
        dayOfWeek: "Monday",
        programId: 'Programa 1',
        channelId: 'Canal 1',
     };
    const result = await controller.create(createScheduleDto);
    expect(result).toEqual({ time: '10:00', programName: 'Programa 1', channelName: 'Canal 1' });
  });

  it('should delete a schedule', async () => {
    const result = await controller.remove('1');
    expect(result).toBeNull();
  });
});