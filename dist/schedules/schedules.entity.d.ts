import { Program } from '../programs/programs.entity';
export declare class Schedule {
    id: number;
    day_of_week: string;
    start_time: string;
    end_time: string;
    program: Program;
}
