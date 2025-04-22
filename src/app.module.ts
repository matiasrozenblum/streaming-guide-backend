import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-store';

import { Channel } from './channels/channels.entity';
import { Program } from './programs/programs.entity';
import { Schedule } from './schedules/schedules.entity';
import { Panelist } from './panelists/panelists.entity';
import { Config } from './config/config.entity';

import { ChannelsModule } from './channels/channels.module';
import { ProgramsModule } from './programs/programs.module';
import { SchedulesModule } from './schedules/schedules.module';
import { PanelistsModule } from './panelists/panelists.module';
import { ScraperModule } from './scraper/scraper.module';
import { ProposedChangesModule } from './proposed-changes/proposed-changes.module';
import { AuthModule } from './auth/auth.module';
import { YoutubeLiveModule } from './youtube/youtube-live.module';
import { EmailModule } from './email/email.module';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { YoutubeDiscoveryService } from './youtube/youtube-discovery.service';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL');
        console.log('🚀 REDIS_URL usado:', redisUrl);

        return {
          store: await redisStore({
            url: redisUrl,
            ttl: 3600, // segundos
          }),
        };
      },
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const dbUrl = config.get<string>('DATABASE_URL');
        const isProduction = config.get<string>('NODE_ENV') === 'production';
        console.log('🌐 Connecting to DB:', dbUrl);

        return {
          type: 'postgres',
          url: dbUrl,
          ssl: { rejectUnauthorized: false },
          autoLoadEntities: true,
          synchronize: !isProduction,
          logging: !isProduction,
          extra: {
            max: 20,
            connectionTimeoutMillis: 2000,
            idleTimeoutMillis: 30000,
            statement_timeout: 10000,
            query_timeout: 10000,
          },
          cache: { duration: 30000 }, // 30s cache interno de consultas
        };
      },
    }),
    TypeOrmModule.forFeature([Channel, Program, Schedule, Panelist, Config]),
    ChannelsModule,
    ProgramsModule,
    SchedulesModule,
    PanelistsModule,
    ScraperModule,
    ConfigModule,          // <-- 🔥 Usá ConfigModule, no AppConfigModule
    AuthModule,
    YoutubeLiveModule,
    ProposedChangesModule,
    EmailModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    YoutubeDiscoveryService,
  ],
})
export class AppModule {}
