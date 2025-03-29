import { Channel } from '../channels/channels.entity';
import { Schedule } from '../schedules/schedules.entity';
import { Panelist } from '../panelists/panelists.entity';
export declare class Program {
    id: number;
    name: string;
    description: string;
    start_time: string;
    end_time: string;
    channel: Channel;
    schedules: Schedule[];
    panelists: Panelist[];
    logo_url: string | null;
    youtube_url: string | null;
}
