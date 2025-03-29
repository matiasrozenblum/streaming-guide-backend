import { Repository, DataSource } from 'typeorm';
import { Channel } from './channels/channels.entity';
import { Program } from './programs/programs.entity';
import { Schedule } from './schedules/schedules.entity';
import { Panelist } from './panelists/panelists.entity';
export declare class AppController {
    private readonly channelsRepository;
    private readonly programsRepository;
    private readonly schedulesRepository;
    private readonly panelistsRepository;
    private readonly dataSource;
    constructor(channelsRepository: Repository<Channel>, programsRepository: Repository<Program>, schedulesRepository: Repository<Schedule>, panelistsRepository: Repository<Panelist>, dataSource: DataSource);
    seed(): Promise<{
        message: string;
    }>;
}
