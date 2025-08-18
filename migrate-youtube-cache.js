#!/usr/bin/env node

/**
 * Simple migration script for YouTube cache migration
 * Run with: node migrate-youtube-cache.js [command]
 */

const { YoutubeMigrationUtil } = require('./dist/youtube/youtube-migration.util');
const { RedisService } = require('./dist/redis/redis.service');
const { SentryService } = require('./dist/sentry/sentry.service');

// Mock SentryService for migration script
class MockSentryService {
  captureMessage() {}
  setTag() {}
  captureException() {}
}

async function runMigration() {
  const command = process.argv[2] || 'status';
  
  try {
    // Initialize services
    const sentryService = new MockSentryService();
    const redisService = new RedisService(sentryService);
    const migrationUtil = new YoutubeMigrationUtil(redisService);
    
    console.log('🚀 YouTube Cache Migration Tool');
    console.log('---');
    
    switch (command) {
      case 'status':
        await migrationUtil.printMigrationStatus();
        break;
        
      case 'migrate':
        console.log('🔄 Starting migration of all legacy cache entries...');
        const result = await migrationUtil.migrateAllLegacyCache();
        
        console.log('\n📊 Migration Results:');
        console.log(`Total channels: ${result.totalChannels}`);
        console.log(`Successfully migrated: ${result.migratedChannels}`);
        console.log(`Failed: ${result.failedChannels}`);
        
        if (result.failedChannels > 0) {
          console.log('\n❌ Failed migrations:');
          result.details
            .filter(d => !d.success)
            .forEach(d => console.log(`  ${d.channelId}: ${d.error}`));
        }
        break;
        
      case 'cleanup':
        console.log('🧹 Starting legacy cache cleanup...');
        console.log('⚠️  This will permanently delete legacy cache entries!');
        console.log('⚠️  Make sure all channels are successfully migrated first.');
        
        const cleanupResult = await migrationUtil.cleanupLegacyCache();
        
        console.log('\n📊 Cleanup Results:');
        console.log(`Channels cleaned: ${cleanupResult.cleanedChannels}`);
        console.log(`Failed: ${cleanupResult.failedChannels}`);
        
        if (cleanupResult.failedChannels > 0) {
          console.log('\n❌ Failed cleanups:');
          cleanupResult.details
            .filter(d => !d.success)
            .forEach(d => console.log(`  ${d.channelId}: ${d.error}`));
        }
        break;
        
      case 'rollback':
        console.log('🔄 Rolling back migration to legacy format...');
        console.log('⚠️  This is an emergency function - use with caution!');
        
        const rollbackResult = await migrationUtil.rollbackMigration();
        
        console.log('\n📊 Rollback Results:');
        console.log(`Channels rolled back: ${rollbackResult.rolledBackChannels}`);
        console.log(`Failed: ${rollbackResult.failedChannels}`);
        
        if (rollbackResult.failedChannels > 0) {
          console.log('\n❌ Failed rollbacks:');
          rollbackResult.details
            .filter(d => !d.success)
            .forEach(d => console.log(`  ${d.channelId}: ${d.error}`));
        }
        break;
        
      default:
        console.log('Usage: node migrate-youtube-cache.js [command]');
        console.log('');
        console.log('Commands:');
        console.log('  status     Show migration status');
        console.log('  migrate    Migrate all channels');
        console.log('  cleanup    Clean up legacy cache (use with caution)');
        console.log('  rollback   Rollback migration (emergency use)');
        console.log('');
        console.log('Examples:');
        console.log('  node migrate-youtube-cache.js status');
        console.log('  node migrate-youtube-cache.js migrate');
        console.log('  node migrate-youtube-cache.js cleanup');
        break;
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

// Run the migration
runMigration();
