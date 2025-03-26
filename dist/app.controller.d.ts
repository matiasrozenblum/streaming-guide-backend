import { Repository } from 'typeorm';
import { Channel } from './channels/channels.entity';
import { Program } from './programs/programs.entity';
import { Schedule } from './schedules/schedules.entity';
import { Panelist } from './panelists/panelists.entity';
export declare class AppController {
    private readonly channelsRepository;
    private readonly programsRepository;
    private readonly schedulesRepository;
    private readonly panelistsRepository;
    constructor(channelsRepository: Repository<Channel>, programsRepository: Repository<Program>, schedulesRepository: Repository<Schedule>, panelistsRepository: Repository<Panelist>);
    seed(): Promise<{
        success: boolean;
        channels: ({
            name: string;
            description: string;
            logo_url: string;
        } & Channel)[];
        programs: ({
            name: string;
            description: string;
            start_time: string;
            end_time: string;
            channel: {
                name: string;
                description: string;
                logo_url: string;
            } & Channel;
        } & Program)[];
        schedule: ({
            day_of_week: string;
            start_time: string;
            end_time: string;
            program: {
                name: string;
                description: string;
                start_time: string;
                end_time: string;
                channel: {
                    name: string;
                    description: string;
                    logo_url: string;
                } & Channel;
            } & Program;
        } & Schedule)[];
    }>;
}
