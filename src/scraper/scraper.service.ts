import { Injectable } from '@nestjs/common';
import { scrapeVorterixSchedule } from './vorterix.scraper';

@Injectable()
export class ScraperService {
  async scrapeVorterixSchedule() {
    return scrapeVorterixSchedule();
  }
}