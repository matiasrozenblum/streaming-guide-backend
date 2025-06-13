import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Channel } from './channels/channels.entity';
import { Program } from './programs/programs.entity';
import { Schedule } from './schedules/schedules.entity';
import { Panelist } from './panelists/panelists.entity';
import { Config } from './config/config.entity';
import { Device } from './users/device.entity';
import { UserSubscription } from './users/user-subscription.entity';
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
import { RedisService } from './redis/redis.service';
import { ScheduleModule } from '@nestjs/schedule';
import { PushModule } from './push/push.module';
import { NotificationsModule } from './notifications/notifications.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const dbUrl = config.get<string>('DATABASE_URL');
        const nodeEnv = config.get<string>('NODE_ENV');
        const isProduction = nodeEnv === 'production';
        console.log('🌐 Connecting to DB:', dbUrl);
        console.log('🔧 NODE_ENV:', nodeEnv, '| isProduction:', isProduction);

        return {
          type: 'postgres',
          url: dbUrl,
          ssl: { rejectUnauthorized: false },
          autoLoadEntities: true,
          synchronize: !isProduction,
          logging: false,
          extra: {
            max: 20,
            connectionTimeoutMillis: 2000,
            idleTimeoutMillis: 30000,
            statement_timeout: 10000,
            query_timeout: 10000,
          },
          cache: { duration: 30000 },
        };
      },
    }),
    TypeOrmModule.forFeature([Channel, Program, Schedule, Panelist, Config, Device, UserSubscription]),
    ChannelsModule,
    ProgramsModule,
    SchedulesModule,
    PanelistsModule,
    ScraperModule,
    ConfigModule,
    AuthModule,
    YoutubeLiveModule,
    ProposedChangesModule,
    EmailModule,
    PushModule,
    NotificationsModule,
    UsersModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    YoutubeDiscoveryService,
    RedisService, // 🔥 Agregado
  ],
})
export class AppModule {}
