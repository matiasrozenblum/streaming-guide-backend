#!/usr/bin/env node

/**
 * Cleanup script to remove old YouTube API cache entries
 * Usage: node scripts/cleanup-youtube-cache.js
 */

const Redis = require('ioredis');

async function cleanupYouTubeCache() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.error('❌ REDIS_URL environment variable is not set');
    process.exit(1);
  }

  const redis = new Redis(redisUrl + '?family=0');
  
  try {
    console.log('🧹 Starting YouTube API cache cleanup...');
    console.log(`🔗 Redis URL: ${redisUrl.replace(/\/\/.*@/, '//***:***@')}`); // Hide credentials
    
    // Find all keys matching the patterns
    const usageKeys = await redis.keys('youtube_api:usage:*');
    const frequencyKeys = await redis.keys('youtube_api:channel_frequency:*');
    
    const allKeys = [...usageKeys, ...frequencyKeys];
    
    if (allKeys.length === 0) {
      console.log('✅ No YouTube API cache keys found to clean up');
      return;
    }
    
    console.log(`📊 Found ${allKeys.length} keys to delete:`);
    console.log(`   - youtube_api:usage:*: ${usageKeys.length} keys`);
    console.log(`   - youtube_api:channel_frequency:*: ${frequencyKeys.length} keys`);
    
    // Show some examples
    if (allKeys.length > 0) {
      console.log('📋 Example keys to be deleted:');
      allKeys.slice(0, 5).forEach(key => console.log(`   - ${key}`));
      if (allKeys.length > 5) {
        console.log(`   ... and ${allKeys.length - 5} more`);
      }
    }
    
    // Delete all keys
    if (allKeys.length > 0) {
      const deleted = await redis.del(...allKeys);
      console.log(`✅ Successfully deleted ${deleted} cache keys`);
    }
    
    console.log('🎉 YouTube API cache cleanup completed!');
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  } finally {
    await redis.disconnect();
  }
}

// Run cleanup
cleanupYouTubeCache();
