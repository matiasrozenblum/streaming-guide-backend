import { Controller, Post, Get } from '@nestjs/common';
import { ScraperService } from './scraper.service';

@Controller('scrape')
export class ScraperController {
  constructor(private readonly scraperService: ScraperService) {}

  @Post('all/update')
  async handleWeeklyScrapersUpdate() {
    return this.scraperService.handleWeeklyScrapersUpdate();
  }

  @Post('vorterix/insert')
  async insertVorterixSchedule() {
    return this.scraperService.insertVorterixSchedule();
  }

  @Get('gelatina/insert')
  insertGelatinaSchedule() {
    return this.scraperService.insertGelatinaSchedule();
  }

  @Get('urbana/insert')
  scrapeUrbanaPlaySchedule() {
    return this.scraperService.insertUrbanaSchedule();
  }
}