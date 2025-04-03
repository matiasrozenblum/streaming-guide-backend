import { Repository } from 'typeorm';
import { Channel } from '../channels/channels.entity';
import { Program } from '../programs/programs.entity';
import { Schedule } from '../schedules/schedules.entity';
export declare class ScraperService {
    private readonly channelRepo;
    private readonly programRepo;
    private readonly scheduleRepo;
    constructor(channelRepo: Repository<Channel>, programRepo: Repository<Program>, scheduleRepo: Repository<Schedule>);
    handleWeeklyVorterixUpdate(): Promise<void>;
    handleWeeklyGelatinaUpdate(): Promise<void>;
    handleWeeklyUrbanaUpdate(): Promise<void>;
    insertVorterixSchedule(): Promise<{
        success: boolean;
    }>;
    insertGelatinaSchedule(): Promise<{
        success: boolean;
    }>;
    insertUrbanaSchedule(): Promise<{
        success: boolean;
    }>;
}
