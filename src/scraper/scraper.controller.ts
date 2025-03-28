import { Controller, Post, Get } from '@nestjs/common';
import { ScraperService } from './scraper.service';

@Controller('scrape')
export class ScraperController {
  constructor(private readonly scraperService: ScraperService) {}

  @Post('vorterix/insert')
  async insertVorterixSchedule() {
  return this.scraperService.insertVorterixSchedule();
}
}