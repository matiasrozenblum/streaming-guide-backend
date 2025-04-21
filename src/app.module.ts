import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-store';
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
import { ConfigModule as AppConfigModule } from './config/config.module';
import { Config } from './config/config.entity';
import { CacheConfigModule } from './cache/cache.module';
import { AuthModule } from './auth/auth.module';
import { AppService } from './app.service';
import { YoutubeDiscoveryService } from './youtube/youtube-discovery.service';
import { YoutubeLiveModule } from './youtube/youtube-live.module';
import { ProposedChangesModule } from './proposed-changes/proposed-changes.module';
import { EmailModule } from './email/email.module';

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
      useFactory: async (config: ConfigService) => ({
        store: redisStore as any,
        url: config.get<string>('REDIS_URL'),
        ttl: 3600,
      }),
    }),
    CacheConfigModule,
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
          ssl: {
            rejectUnauthorized: false,
          },
          autoLoadEntities: true,
          synchronize: !isProduction, // Disable in production
          logging: !isProduction, // Disable in production
          // Connection pooling
          extra: {
            max: 20, // Maximum number of connections in the pool
            connectionTimeoutMillis: 2000, // Connection timeout
            idleTimeoutMillis: 30000, // Idle connection timeout
            // Enable prepared statements
            statement_timeout: 10000, // Statement timeout in ms
            query_timeout: 10000, // Query timeout in ms
          },
          // Cache queries
          cache: {
            duration: 30000, // 30 seconds
          },
        };
      },
    }),
    CacheModule.register({
      isGlobal: true,
      store: redisStore,
      host: process.env.REDIS_HOST ?? 'localhost',
      port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
      ttl: 3600,
    }),
    TypeOrmModule.forFeature([Channel, Program, Schedule, Panelist, Config]),
    ChannelsModule,
    ProgramsModule,
    SchedulesModule,
    PanelistsModule,
    ScraperModule,
    AppConfigModule,
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
