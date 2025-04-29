import { Test, TestingModule } from '@nestjs/testing';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';
import { NotFoundException } from '@nestjs/common';
import { UpdateScheduleDto } from './dto/update-schedule.dto';

interface Schedule {
  id: number;
  day_of_week: string;
  start_time: string;
  end_time: string;
  program: {
    id: number;
    name: string;
    description?: string;
    channel_id?: number;
    channel?: {
      id: number;
      name: string;
      description?: string;
      logo_url?: string;
      handle?: string;
    };
    panelists?: Array<{
      id: number;
      name: string;
    }>;
    logo_url?: string;
    youtube_url?: string;
  };
}

describe('SchedulesController', () => {
  let controller: SchedulesController;
  let service: SchedulesService;
  let mockSchedulesService: Partial<SchedulesService>;

  const mockSchedule: Schedule = {
    id: 1,
    day_of_week: 'monday',
    start_time: '10:00',
    end_time: '11:00',
    program: {
      id: 1,
      name: 'Test Program',
      description: 'Test Description',
      channel: {
        id: 1,
        name: 'Test Channel',
        description: 'Test Channel Description',
        logo_url: 'test.jpg',
        handle: 'test',
      },
      panelists: [],
      logo_url: 'test.jpg',
      youtube_url: 'test.com',
    },
  };

  beforeEach(async () => {
    mockSchedulesService = {
      create: jest.fn().mockResolvedValue(mockSchedule),
      findAll: jest.fn().mockResolvedValue({ data: [mockSchedule], total: 1 }),
      findOne: jest.fn().mockImplementation((id: string) => {
        if (id === '1') return Promise.resolve(mockSchedule);
        return Promise.resolve(null);
      }),
      update: jest.fn().mockResolvedValue(mockSchedule),
      remove: jest.fn().mockResolvedValue(true),
    };

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
      expect(result).toEqual({ data: [mockSchedule], total: 1 });
      expect(service.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a single schedule', async () => {
      const result = await controller.findOne('1');
      expect(result).toEqual(mockSchedule);
      expect(service.findOne).toHaveBeenCalledWith('1');
    });

    it('should throw NotFoundException when schedule not found', async () => {
      await expect(controller.findOne('2')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a schedule', async () => {
      const updateDto: UpdateScheduleDto = { dayOfWeek: 'tuesday' };
      const result = await controller.update('1', updateDto);
      expect(result).toEqual(mockSchedule);
      expect(service.update).toHaveBeenCalledWith('1', updateDto);
    });

    it('should throw NotFoundException when schedule not found', async () => {
      (service.update as jest.Mock).mockRejectedValueOnce(new NotFoundException());
      await expect(controller.update('2', { dayOfWeek: 'tuesday' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should remove a schedule', async () => {
      const result = await controller.remove('1');
      expect(result).toBe(true);
      expect(service.remove).toHaveBeenCalledWith('1');
    });

    it('should throw NotFoundException when schedule not found', async () => {
      (service.remove as jest.Mock).mockRejectedValueOnce(new NotFoundException());
      await expect(controller.remove('2')).rejects.toThrow(NotFoundException);
    });
  });
});