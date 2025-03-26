import { Repository } from 'typeorm';
import { Schedule } from './schedules.entity';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { Program } from '../programs/programs.entity';
export declare class SchedulesService {
    private schedulesRepository;
    private programsRepository;
    constructor(schedulesRepository: Repository<Schedule>, programsRepository: Repository<Program>);
    findAll(): Promise<Schedule[]>;
    findOne(id: string): Promise<Schedule>;
    create(createScheduleDto: CreateScheduleDto): Promise<Schedule>;
    remove(id: string): Promise<void>;
}
