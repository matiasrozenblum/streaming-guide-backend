import { ScraperService } from './scraper.service';
export declare class ScraperController {
    private readonly scraperService;
    constructor(scraperService: ScraperService);
    scrapeVorterix(): Promise<import("./vorterix.scraper").VorterixProgram[]>;
}
