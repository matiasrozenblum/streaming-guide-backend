import { Module } from '@nestjs/common';
import { ScraperController } from './scraper.controller';
import { ScraperService } from './scraper.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Channel } from '../channels/channels.entity';
import { Program } from '../programs/programs.entity';
import { Schedule } from '../schedules/schedules.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Channel, Program, Schedule]), // 👈 Importá las 3 entidades necesarias
  ],
  controllers: [ScraperController],
  providers: [ScraperService],
})
export class ScraperModule {}