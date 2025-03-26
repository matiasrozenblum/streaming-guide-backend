import { Program } from '../programs/programs.entity';
export declare class Panelist {
    id: number;
    name: string;
    photo_url: string;
    bio: string;
    programs: Program[];
}
