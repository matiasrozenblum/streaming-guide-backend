import { SchedulesService } from './schedules.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { Schedule } from './schedules.entity';
export declare class SchedulesController {
    private readonly schedulesService;
    constructor(schedulesService: SchedulesService);
    findAll(): Promise<Schedule[]>;
    findOne(id: string): Promise<Schedule>;
    create(createScheduleDto: CreateScheduleDto): Promise<Schedule>;
    remove(id: string): Promise<void>;
}
