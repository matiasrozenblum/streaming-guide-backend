import { Controller, Post, Get, Inject, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Channel } from './channels/channels.entity';
import { Program } from './programs/programs.entity';
import { Schedule } from './schedules/schedules.entity';
import { Panelist } from './panelists/panelists.entity';
import { YoutubeDiscoveryService } from './youtube/youtube-discovery.service';
import { YoutubeLiveService } from './youtube/youtube-live.service';
import { RedisService } from './redis/redis.service'; // 🔥
import { AuthGuard } from '@nestjs/passport';
import * as DateHolidays from 'date-holidays';
import { Roles } from './auth/roles.decorator';
import { Response } from 'express';
import { AppService } from './app.service';
import { SentryService } from './sentry/sentry.service';
import { ResourceMonitorService } from './services/resource-monitor.service';

const HolidaysClass = (DateHolidays as any).default ?? DateHolidays;

@Controller()
export class AppController {
  private hd = new HolidaysClass('AR');
  constructor(
    @InjectRepository(Channel)
    private readonly channelsRepository: Repository<Channel>,
    @InjectRepository(Program)
    private readonly programsRepository: Repository<Program>,
    @InjectRepository(Schedule)
    private readonly schedulesRepository: Repository<Schedule>,
    @InjectRepository(Panelist)
    private readonly panelistsRepository: Repository<Panelist>,
    private readonly dataSource: DataSource,
    private readonly youtubeDiscoveryService: YoutubeDiscoveryService,
    private readonly youtubeLiveService: YoutubeLiveService,
    private readonly redisService: RedisService, // 🔥
    private readonly appService: AppService,
    private readonly sentryService: SentryService,
    private readonly resourceMonitorService: ResourceMonitorService,
  ) {
    console.log('🚀 AppController initialized');
  }

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('health/detailed')
  async detailedHealth() {
    const healthChecks = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        database: 'unknown',
        redis: 'unknown',
        youtube: 'unknown',
      },
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };

    try {
      // Check database connection
      await this.dataSource.query('SELECT 1');
      healthChecks.services.database = 'ok';
    } catch (error) {
      healthChecks.services.database = 'error';
      healthChecks.status = 'degraded';
    }

    try {
      // Check Redis connection
      await this.redisService.client.ping();
      healthChecks.services.redis = 'ok';
    } catch (error) {
      healthChecks.services.redis = 'error';
      healthChecks.status = 'degraded';
    }

    try {
      // Check YouTube API (basic check)
      await this.youtubeDiscoveryService.getChannelIdFromHandle('test');
      healthChecks.services.youtube = 'ok';
    } catch (error) {
      healthChecks.services.youtube = 'error';
      // Don't mark as degraded for external service
    }

    return healthChecks;
  }

  @Post('test-error')
  testError() {
    // Test Sentry error reporting
    this.sentryService.captureMessage('Test error for monitoring setup', 'error', {
      test: true,
      timestamp: new Date().toISOString(),
    });
    
    return { message: 'Test error sent to Sentry' };
  }

  @Post('test-betterstack')
  testBetterStack() {
    // Test BetterStack error reporting
    this.sentryService.captureMessage('Test error for BetterStack monitoring setup', 'error', {
      test: true,
      service: 'betterstack',
      timestamp: new Date().toISOString(),
    });
    
    return { message: 'Test error sent to BetterStack' };
  }

  @Post('test-youtube-error')
  testYoutubeError() {
    // Test YouTube API error simulation
    this.sentryService.captureMessage('YouTube API 403 Forbidden for channel test-channel', 'error', {
      channelId: 'test-channel-id',
      handle: 'test-channel',
      context: 'test',
      errorMessage: 'Request failed with status code 403',
      apiUrl: 'https://www.googleapis.com/youtube/v3/search',
      timestamp: new Date().toISOString(),
    });
    
    this.sentryService.setTag('service', 'youtube-api');
    this.sentryService.setTag('error_type', '403_forbidden');
    this.sentryService.setTag('channel', 'test-channel');
    
    return { message: 'Test YouTube API error sent to Sentry' };
  }

  @Post('test-database-error')
  testDatabaseError() {
    // Test database connection error simulation
    this.sentryService.captureMessage('Database connection timeout - PostgreSQL unreachable', 'error', {
      service: 'database',
      error_type: 'connection_timeout',
      database_url: process.env.DATABASE_URL?.split('@')[1] || 'unknown',
      timestamp: new Date().toISOString(),
    });
    
    this.sentryService.setTag('service', 'database');
    this.sentryService.setTag('error_type', 'connection_timeout');
    
    return { message: 'Test database connection error sent to Sentry' };
  }

  @Post('test-jwt-error')
  testJwtError() {
    // Test JWT authentication error simulation
    this.sentryService.captureMessage('JWT token validation failed - Invalid JWT_SECRET', 'error', {
      service: 'authentication',
      error_type: 'jwt_validation_failed',
      jwt_secret_length: process.env.JWT_SECRET?.length || 0,
      timestamp: new Date().toISOString(),
    });
    
    this.sentryService.setTag('service', 'authentication');
    this.sentryService.setTag('error_type', 'jwt_validation_failed');
    
    return { message: 'Test JWT authentication error sent to Sentry' };
  }

  @Post('test-redis-error')
  testRedisError() {
    // Test Redis connection error simulation
    this.sentryService.captureMessage('Redis connection timeout - Cache service unavailable', 'error', {
      service: 'redis',
      error_type: 'connection_timeout',
      redis_url: process.env.REDIS_URL?.split('@')[1] || 'unknown',
      timestamp: new Date().toISOString(),
    });
    
    this.sentryService.setTag('service', 'redis');
    this.sentryService.setTag('error_type', 'connection_timeout');
    
    return { message: 'Test Redis connection error sent to Sentry' };
  }

  @Post('test-migration-error')
  testMigrationError() {
    // Test database migration error simulation
    this.sentryService.captureMessage('Database migration failed - Missing column gender in users table', 'error', {
      service: 'database',
      error_type: 'migration_failed',
      missing_column: 'gender',
      table: 'users',
      migration: 'AddGenderAndBirthDate',
      timestamp: new Date().toISOString(),
    });
    
    this.sentryService.setTag('service', 'database');
    this.sentryService.setTag('error_type', 'migration_failed');
    
    return { message: 'Test database migration error sent to Sentry' };
  }

  @Post('test-email-error')
  testEmailError() {
    // Test email service error simulation
    this.sentryService.captureMessage('Email service failure - SMTP connection timeout', 'error', {
      service: 'email',
      error_type: 'smtp_connection_failed',
      smtp_host: process.env.SMTP_HOST || 'unknown',
      smtp_port: process.env.SMTP_PORT || 'unknown',
      error_message: 'Connection timeout to SMTP server',
      timestamp: new Date().toISOString(),
    });
    
    this.sentryService.setTag('service', 'email');
    this.sentryService.setTag('error_type', 'smtp_connection_failed');
    
    return { message: 'Test email service error sent to Sentry' };
  }

  @Post('test-slow-api')
  testSlowApi() {
    // Simulate a slow API response
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ message: 'Slow API response simulated' });
      }, 6000); // 6 seconds - should trigger slow response alert
    });
  }

  @Post('test-critical-slow-api')
  testCriticalSlowApi() {
    // Simulate a critical slow API response
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ message: 'Critical slow API response simulated' });
      }, 12000); // 12 seconds - should trigger critical slow response alert
    });
  }

  @Post('test-api-error')
  testApiError() {
    // Simulate an API error
    throw new Error('Simulated API error for testing');
  }

  @Get('health/resources')
  getResourceStats() {
    return this.resourceMonitorService.getResourceStats();
  }

  @Get('debug/schedules')
  async debugSchedules() {
    const schedulesRepo = this.appService.getSchedulesRepository();
    
    // Check database connection info
    const connection = schedulesRepo.manager.connection;
    const databaseName = connection.options.database;
    const host = (connection.options as any).host;
    
    // Check table existence and structure
    const tableExists = await connection.query(
      "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'schedules')"
    );
    
    const totalSchedules = await schedulesRepo.count();
    const sampleSchedules = await schedulesRepo.find({
      take: 5,
      relations: ['program', 'program.channel']
    });
    
    // Raw SQL query to check data
    const rawSchedules = await connection.query('SELECT * FROM schedules LIMIT 5');
    
    return {
      databaseInfo: {
        database: databaseName,
        host: host,
        tableExists: tableExists[0]?.exists
      },
      totalSchedules,
      sampleSchedules: sampleSchedules.map(s => ({
        id: s.id,
        day_of_week: s.day_of_week,
        start_time: s.start_time,
        program_id: s.program_id,
        program: s.program ? { id: s.program.id, name: s.program.name } : null,
        channel: s.program?.channel ? { id: s.program.channel.id, name: s.program.channel.name } : null
      })),
      rawSchedules: rawSchedules
    };
  }

  @Get('youtube/resolve-handles')
  async getChannelsFromHandles() {
    // Get all channels from the database
    const channels = await this.channelsRepository.find({
      select: ['handle']
    });

    // Filter out channels without handles and build YouTube URLs
    const youtubeUrls = channels
      .filter(channel => channel.handle && channel.handle.trim() !== '')
      .map(channel => {
        // Ensure handle starts with @ if it doesn't already
        const handle = channel.handle.startsWith('@') ? channel.handle : `@${channel.handle}`;
        return `https://www.youtube.com/${handle}/live`;
      });

    if (youtubeUrls.length === 0) {
      return { message: 'No channels with valid handles found in the database' };
    }

    return this.youtubeDiscoveryService.getChannelIdsFromLiveUrls(youtubeUrls);
  }

  @UseGuards(AuthGuard('jwt'))
  @Roles('admin')
  @Post('youtube/fetch-live-ids')
  async fetchYoutubeLiveIds() {
    await this.youtubeLiveService.fetchLiveVideoIds();
    return { 
      success: true, 
      message: 'YouTube live video IDs fetched successfully.' 
    };
  }

  @Post('cache-test')
  async cacheTestSet() {
    const key = 'test:mykey';
    const value = { hello: 'world', timestamp: Date.now() };
    const ttl = 300; // 5 minutos

    console.log(`📝 Setting key ${key} with value`, value);
    await this.redisService.set(key, value, ttl);
    console.log(`✅ Key ${key} set successfully.`);

    return { message: 'Cache set!', key, value, ttl };
  }

  @Get('cache-test')
  async cacheTestGet() {
    const key = 'test:mykey';

    console.log(`🔎 Getting key ${key} from Redis...`);
    const cachedValue = await this.redisService.get(key);
    console.log(`📦 Retrieved value for key ${key}:`, cachedValue);

    return { key, cachedValue };
  }

  @Get('cache-test-del')
  async cacheTestDel() {
    const patterns = [
      'cron:count:*',
      'onDemand:count:*',
      'cron:*:count:*',
      'onDemand:*:count:*',
    ];

    for (const pattern of patterns) {
      await this.redisService.delByPattern(pattern);
    }

    return { message: 'All counter entries deleted.' };
  }

  @UseGuards(AuthGuard('jwt'))
  @Roles('admin')
  @Post('cache/clear-schedules')
  async clearScheduleCache() {
    await this.redisService.delByPattern('schedules:all:*');
    return { 
      success: true, 
      message: 'Schedule cache cleared successfully' 
    };
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('stats')
  async getStats(): Promise<{
    channels: number;
    programs: number;
    panelists: number;
    schedules: number;
  }> {
    const [
      channelsCount,
      programsCount,
      panelistsCount,
      schedulesCount,
    ] = await Promise.all([
      this.channelsRepository.count(),
      this.programsRepository.count(),
      this.panelistsRepository.count(),
      this.schedulesRepository.count(),
    ]);

    return {
      channels: channelsCount,
      programs: programsCount,
      panelists: panelistsCount,
      schedules: schedulesCount,
    };
  }
  
  @Get('holiday')
  isHoliday() {
    const today = new Date();
    return { holiday: !!this.hd.isHoliday(today) };
  }
}
