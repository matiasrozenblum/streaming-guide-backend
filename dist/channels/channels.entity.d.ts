import { Program } from '../programs/programs.entity';
export declare class Channel {
    id: number;
    name: string;
    streaming_url: string;
    logo_url: string;
    description: string;
    programs: Program[];
}
