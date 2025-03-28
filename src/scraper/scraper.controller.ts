import { Controller, Post, Get } from '@nestjs/common';
import { ScraperService } from './scraper.service';

@Controller('scrape')
export class ScraperController {
  constructor(private readonly scraperService: ScraperService) {}

  @Get('vorterix')
  async scrapeVorterix() {
    return this.scraperService.scrapeVorterixSchedule();
  }
}