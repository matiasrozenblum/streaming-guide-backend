import { Test, TestingModule } from '@nestjs/testing';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { Schedule } from './schedules.entity';
import { Program } from '../programs/programs.entity';
import { NotFoundException } from '@nestjs/common';

describe('SchedulesController', () => {
  let controller: SchedulesController;
  let service: SchedulesService;

  const mockProgram: Program = {
    id: 1,
    name: 'Test Program',
    description: 'Test Description',
    channel: {
      id: 1,
      name: 'Test Channel',
      description: 'Test Channel Description',
      streaming_url: 'http://example.com/stream',
      logo_url: 'http://example.com/logo.jpg',
      programs: [],
    },
    schedules: [],
    panelists: [],
    logo_url: null,
    youtube_url: null,
  };

  const mockSchedule: Schedule = {
    id: 1,
    day_of_week: 'Monday',
    start_time: '10:00:00',
    end_time: '12:00:00',
    program: mockProgram,
  };

  const mockSchedulesService = {
    findAll: jest.fn().mockResolvedValue([mockSchedule]),
    findOne: jest.fn().mockResolvedValue(mockSchedule),
    findByProgram: jest.fn().mockResolvedValue([mockSchedule]),
    findByDay: jest.fn().mockResolvedValue([mockSchedule]),
    create: jest.fn().mockResolvedValue(mockSchedule),
    update: jest.fn().mockResolvedValue(mockSchedule),
    remove: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SchedulesController],
      providers: [
        {
          provide: SchedulesService,
          useValue: mockSchedulesService,
        },
      ],
    }).compile();

    controller = module.get<SchedulesController>(SchedulesController);
    service = module.get<SchedulesService>(SchedulesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return an array of schedules', async () => {
      const result = await controller.findAll();
      expect(result).toEqual([mockSchedule]);
      expect(service.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a single schedule', async () => {
      const result = await controller.findOne('1');
      expect(result).toEqual(mockSchedule);
      expect(service.findOne).toHaveBeenCalledWith('1');
    });

    it('should throw NotFoundException when schedule does not exist', async () => {
      mockSchedulesService.findOne.mockResolvedValueOnce(null);
      await expect(controller.findOne('999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByProgram', () => {
    it('should return schedules for a program', async () => {
      const result = await controller.findByProgram('1');
      expect(result).toEqual([mockSchedule]);
      expect(service.findByProgram).toHaveBeenCalledWith('1');
    });
  });

  describe('findByDay', () => {
    it('should return schedules for a day', async () => {
      const result = await controller.findByDay('Monday');
      expect(result).toEqual([mockSchedule]);
      expect(service.findByDay).toHaveBeenCalledWith('Monday');
    });
  });

  describe('create', () => {
    it('should create a new schedule', async () => {
      const createScheduleDto: CreateScheduleDto = {
        programId: '1',
        channelId: '1',
        dayOfWeek: 'Monday',
        startTime: '10:00:00',
        endTime: '12:00:00',
      };

      const result = await controller.create(createScheduleDto);
      expect(result).toEqual(mockSchedule);
      expect(service.create).toHaveBeenCalledWith(createScheduleDto);
    });
  });

  describe('update', () => {
    it('should update a schedule', async () => {
      const updateScheduleDto: UpdateScheduleDto = {
        dayOfWeek: 'Tuesday',
      };

      const result = await controller.update('1', updateScheduleDto);
      expect(result).toEqual(mockSchedule);
      expect(service.update).toHaveBeenCalledWith('1', updateScheduleDto);
    });

    it('should throw NotFoundException when updating non-existent schedule', async () => {
      mockSchedulesService.update.mockRejectedValueOnce(new NotFoundException());
      const updateScheduleDto: UpdateScheduleDto = {
        dayOfWeek: 'Tuesday',
      };
      await expect(controller.update('999', updateScheduleDto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should remove a schedule', async () => {
      await controller.remove('1');
      expect(service.remove).toHaveBeenCalledWith('1');
    });

    it('should throw NotFoundException when removing non-existent schedule', async () => {
      mockSchedulesService.remove.mockResolvedValueOnce(false);
      await expect(controller.remove('999')).rejects.toThrow(NotFoundException);
    });
  });
});