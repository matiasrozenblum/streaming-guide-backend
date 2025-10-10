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
import { Category } from './categories/categories.entity';
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
import { StatisticsModule } from './statistics/statistics.module';
import { SentryModule } from './sentry/sentry.module';
import { CategoriesModule } from './categories/categories.module';
import { RedisModule } from './redis/redis.module';
import { ResourceMonitorService } from './services/resource-monitor.service';
import { PerformanceInterceptor } from './interceptors/performance.interceptor';

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
          synchronize: false, // Temporarily disabled to prevent schema conflicts
          logging: false,
          extra: {
            max: 50, // Increased from 20 to handle more concurrent requests
            min: 5, // Keep minimum connections ready
            connectionTimeoutMillis: 30000, // Increased from 2000ms to 30s for better resilience
            idleTimeoutMillis: 30000,
            acquireTimeoutMillis: 30000, // How long to wait to acquire a connection
            statement_timeout: 15000, // Increased from 10s to 15s
            query_timeout: 15000,
            createTimeoutMillis: 15000,
            destroyTimeoutMillis: 5000,
            reapIntervalMillis: 1000, // Check for idle connections
            createRetryIntervalMillis: 200,
          },
          cache: { duration: 30000 },
          // Enhanced error handling for database connection
          onConnect: async (connection) => {
            console.log('✅ Database connected successfully');
          },
          onError: (error) => {
            console.error('❌ Database connection error:', error);
            // Sentry will be available after module initialization
            // We'll handle this in the main.ts file
          },
        };
      },
    }),
    TypeOrmModule.forFeature([Channel, Program, Schedule, Panelist, Config, Device, UserSubscription, Category]),
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
    StatisticsModule,
    SentryModule,
    CategoriesModule,
    RedisModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    YoutubeDiscoveryService,
    RedisService, // 🔥 Agregado
    ResourceMonitorService,
    {
      provide: 'APP_INTERCEPTOR',
      useClass: PerformanceInterceptor,
    },
  ],
})
export class AppModule {}
