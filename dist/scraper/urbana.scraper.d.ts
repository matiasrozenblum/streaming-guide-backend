export interface UrbanaProgram {
    name: string;
    days: string[];
    startTime: string;
    endTime: string;
    panelists?: string[];
    logoUrl?: string;
}
export declare function scrapeUrbanaPlaySchedule(): Promise<UrbanaProgram[]>;
