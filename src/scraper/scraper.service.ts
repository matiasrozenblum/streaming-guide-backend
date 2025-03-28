import { Injectable } from '@nestjs/common';
import { scrapeLuzuSchedule } from './luzu.scraper';
import { scrapeVorterixSchedule } from './vorterix.scraper';

@Injectable()
export class ScraperService {
  async scrapeLuzuSchedule() {
    return await scrapeLuzuSchedule();
  }
  async scrapeVorterixSchedule() {
    return scrapeVorterixSchedule();
  }
}