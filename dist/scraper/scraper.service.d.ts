import { Repository } from 'typeorm';
import { Channel } from '../channels/channels.entity';
import { Program } from '../programs/programs.entity';
import { Schedule } from '../schedules/schedules.entity';
export declare class ScraperService {
    private readonly channelRepo;
    private readonly programRepo;
    private readonly scheduleRepo;
    constructor(channelRepo: Repository<Channel>, programRepo: Repository<Program>, scheduleRepo: Repository<Schedule>);
    insertVorterixSchedule(): Promise<{
        success: boolean;
    }>;
}
