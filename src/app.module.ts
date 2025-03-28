import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Channel } from './channels/channels.entity';
import { Program } from './programs/programs.entity';
import { Schedule } from './schedules/schedules.entity';
import { Panelist } from './panelists/panelists.entity';
import { ChannelsModule } from './channels/channels.module';
import { ProgramsModule } from './programs/programs.module';
import { SchedulesModule } from './schedules/schedules.module';
import { PanelistsModule } from './panelists/panelists.module';
import { ScraperModule } from './scraper/scraper.module';
import { AppController } from './app.controller';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false, 
      },
      autoLoadEntities: true,
      synchronize: true, // Only for development
      entities: [Channel, Program, Schedule, Panelist],
      logging: true, // Enable query logging for debugging
    }),
    TypeOrmModule.forFeature([Channel, Program, Schedule, Panelist]),
    ChannelsModule,
    ProgramsModule,
    SchedulesModule,
    PanelistsModule,
    ScraperModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
