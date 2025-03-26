import { Controller, Post } from '@nestjs/common';
import { ScraperService } from './scraper.service';

@Controller('scrape')
export class ScraperController {
  constructor(private readonly scraperService: ScraperService) {}

  @Post('luzu')
  async scrapeLuzu() {
    const result = await this.scraperService.scrapeLuzuSchedule();
    return { success: true, data: result };
  }
}