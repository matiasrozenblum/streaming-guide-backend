export interface GelatinaProgram {
    name: string;
    days: string[];
    startTime: string;
    endTime: string;
    panelists?: string[];
    logoUrl?: string;
}
export declare function scrapeGelatinaSchedule(): Promise<GelatinaProgram[]>;
