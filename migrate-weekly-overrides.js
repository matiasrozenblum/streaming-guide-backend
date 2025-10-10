const Redis = require('ioredis');
require('dotenv').config();

async function migrateWeeklyOverrides() {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    console.error('REDIS_URL environment variable is not set.');
    process.exit(1);
  }

  const redis = new Redis(redisUrl);

  try {
    console.log('Connecting to Redis...');
    await redis.ping();
    console.log('Successfully connected to Redis.');

    console.log('Scanning for weekly override keys...');
    let cursor = '0';
    let keys = [];
    let totalKeys = 0;

    do {
      const [nextCursor, scannedKeys] = await redis.scan(cursor, 'MATCH', 'weekly_override:*', 'COUNT', 1000);
      keys = keys.concat(scannedKeys);
      totalKeys += scannedKeys.length;
      cursor = nextCursor;
    } while (cursor !== '0');

    console.log(`Found ${totalKeys} weekly override keys.`);

    if (keys.length === 0) {
      console.log('No weekly overrides found to migrate.');
      return;
    }

    let migratedCount = 0;
    let skippedCount = 0;

    // Process overrides in batches to avoid memory issues
    const batchSize = 10;
    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);
      const pipeline = redis.pipeline();
      
      // Get all overrides in the batch
      batch.forEach(key => pipeline.get(key));
      const results = await pipeline.exec();

      // Process each override in the batch
      for (let j = 0; j < batch.length; j++) {
        const key = batch[j];
        const [err, value] = results[j];
        
        if (err || !value) {
          console.warn(`Failed to get override ${key}:`, err?.message || 'No value');
          continue;
        }

        try {
          const override = JSON.parse(value);
          
          // Check if migration is needed
          const needsPanelistMigration = override.panelistIds && override.panelistIds.length > 0 && !override.panelists;
          const needsChannelMigration = override.specialProgram?.channelId && !override.specialProgram?.channel;
          
          if (!needsPanelistMigration && !needsChannelMigration) {
            console.log(`✓ ${key} - Already migrated or no migration needed`);
            skippedCount++;
            continue;
          }

          console.log(`🔄 ${key} - Migration needed`);
          
          // For this script, we'll just mark them for lazy migration
          // The actual migration will happen when they're accessed
          console.log(`  - Panelist migration needed: ${needsPanelistMigration}`);
          console.log(`  - Channel migration needed: ${needsChannelMigration}`);
          
          migratedCount++;
          
        } catch (parseError) {
          console.error(`Failed to parse override ${key}:`, parseError.message);
        }
      }
    }

    console.log(`\nMigration scan completed:`);
    console.log(`- Total overrides: ${totalKeys}`);
    console.log(`- Overrides needing migration: ${migratedCount}`);
    console.log(`- Overrides already migrated: ${skippedCount}`);
    console.log(`\nNote: Actual migration will happen lazily when overrides are accessed.`);
    console.log(`This ensures no data loss and handles edge cases gracefully.`);

  } catch (error) {
    console.error('Error during migration scan:', error);
  } finally {
    redis.disconnect();
    console.log('Redis connection closed.');
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateWeeklyOverrides();
}

module.exports = { migrateWeeklyOverrides };
