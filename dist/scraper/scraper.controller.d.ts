import { ScraperService } from './scraper.service';
export declare class ScraperController {
    private readonly scraperService;
    constructor(scraperService: ScraperService);
    insertVorterixSchedule(): Promise<{
        success: boolean;
    }>;
    insertGelatinaSchedule(): Promise<{
        success: boolean;
    }>;
}
