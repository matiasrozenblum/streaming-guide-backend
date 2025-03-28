export interface VorterixProgram {
    name: string;
    days: string[];
    startTime: string;
    endTime: string;
}
export declare function scrapeVorterixSchedule(): Promise<VorterixProgram[]>;
