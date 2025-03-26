import { Injectable } from '@nestjs/common';
import { scrapeLuzuSchedule } from './luzu.scraper';

@Injectable()
export class ScraperService {
  async scrapeLuzuSchedule() {
    return await scrapeLuzuSchedule();
  }
}