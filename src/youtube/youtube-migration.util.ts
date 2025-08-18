import { RedisService } from '../redis/redis.service';

/**
 * Utility class to handle Redis cache migration from legacy single video ID
 * structure to new multiple streams structure
 */
export class YoutubeMigrationUtil {
  constructor(private readonly redisService: RedisService) {}

  /**
   * Migrate all existing legacy cache entries to new format
   * This ensures zero-downtime deployment
   */
  async migrateAllLegacyCache(): Promise<{
    totalChannels: number;
    migratedChannels: number;
    failedChannels: number;
    details: Array<{ channelId: string; success: boolean; error?: string }>;
  }> {
    console.log('🔄 Starting Redis cache migration...');
    
    const results = {
      totalChannels: 0,
      migratedChannels: 0,
      failedChannels: 0,
      details: [] as Array<{ channelId: string; success: boolean; error?: string }>,
    };

    try {
      // Get all keys that match the legacy pattern
      const legacyKeys = await this.redisService.keys('liveVideoIdByChannel:*');
      results.totalChannels = legacyKeys.length;
      
      console.log(`📊 Found ${legacyKeys.length} legacy cache entries to migrate`);

      for (const legacyKey of legacyKeys) {
        const channelId = legacyKey.replace('liveVideoIdByChannel:', '');
        
        try {
          const success = await this.migrateSingleChannel(channelId);
          
          if (success) {
            results.migratedChannels++;
            results.details.push({ channelId, success: true });
          } else {
            results.failedChannels++;
            results.details.push({ channelId, success: false, error: 'Migration returned false' });
          }
        } catch (error) {
          results.failedChannels++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          results.details.push({ channelId, success: false, error: errorMessage });
          console.error(`❌ Failed to migrate channel ${channelId}:`, error);
        }
      }

      console.log(`✅ Migration completed: ${results.migratedChannels}/${results.totalChannels} channels migrated successfully`);
      
      if (results.failedChannels > 0) {
        console.warn(`⚠️ ${results.failedChannels} channels failed to migrate`);
      }

    } catch (error) {
      console.error('❌ Migration process failed:', error);
      throw error;
    }

    return results;
  }

  /**
   * Migrate a single channel's legacy cache to new format
   */
  async migrateSingleChannel(channelId: string): Promise<boolean> {
    try {
      const legacyKey = `liveVideoIdByChannel:${channelId}`;
      const newKey = `liveStreamsByChannel:${channelId}`;
      
      // Check if legacy cache exists
      const legacyVideoId = await this.redisService.get<string>(legacyKey);
      if (!legacyVideoId) {
        console.log(`⏭️ No legacy cache found for channel ${channelId}, skipping`);
        return true; // Not an error, just nothing to migrate
      }

      // Check if new cache already exists
      const existingNewCache = await this.redisService.get(newKey);
      if (existingNewCache) {
        console.log(`⏭️ New cache already exists for channel ${channelId}, skipping`);
        return true;
      }

      // Get TTL from legacy cache
      const legacyTTL = await this.redisService.ttl(legacyKey);
      const newTTL = legacyTTL > 0 ? legacyTTL : 3600; // Default to 1 hour if no TTL

      // Create new cache structure
      const legacyStream = {
        videoId: legacyVideoId,
        title: 'Legacy Stream',
        description: 'Migrated from legacy cache',
        publishedAt: new Date().toISOString(),
        isLive: true,
        channelId,
      };

      // Store in new format
      await this.redisService.set(newKey, [legacyStream], newTTL);
      
      console.log(`✅ Migrated channel ${channelId}: ${legacyVideoId} (TTL: ${newTTL}s)`);
      return true;

    } catch (error) {
      console.error(`❌ Failed to migrate channel ${channelId}:`, error);
      return false;
    }
  }

  /**
   * Check migration status for all channels
   */
  async getMigrationStatus(): Promise<{
    legacyEntries: number;
    newEntries: number;
    migratedChannels: number;
    pendingChannels: number;
    details: Array<{ channelId: string; hasLegacy: boolean; hasNew: boolean; status: 'migrated' | 'pending' | 'none' }>;
  }> {
    const legacyKeys = await this.redisService.keys('liveVideoIdByChannel:*');
    const newKeys = await this.redisService.keys('liveStreamsByChannel:*');
    
    const legacyChannelIds = legacyKeys.map(key => key.replace('liveVideoIdByChannel:', ''));
    const newChannelIds = newKeys.map(key => key.replace('liveStreamsByChannel:', ''));
    
    const allChannelIds = new Set([...legacyChannelIds, ...newChannelIds]);
    const details: Array<{ channelId: string; hasLegacy: boolean; hasNew: boolean; status: 'migrated' | 'pending' | 'none' }> = [];

    for (const channelId of allChannelIds) {
      const hasLegacy = legacyChannelIds.includes(channelId);
      const hasNew = newChannelIds.includes(channelId);
      
      let status: 'migrated' | 'pending' | 'none';
      if (hasLegacy && hasNew) {
        status = 'migrated';
      } else if (hasLegacy && !hasNew) {
        status = 'pending';
      } else {
        status = 'none';
      }

      details.push({ channelId, hasLegacy, hasNew, status });
    }

    const migratedChannels = details.filter(d => d.status === 'migrated').length;
    const pendingChannels = details.filter(d => d.status === 'pending').length;

    return {
      legacyEntries: legacyKeys.length,
      newEntries: newKeys.length,
      migratedChannels,
      pendingChannels,
      details,
    };
  }

  /**
   * Clean up legacy cache entries after successful migration
   * Only call this after confirming all channels are migrated
   */
  async cleanupLegacyCache(): Promise<{
    cleanedChannels: number;
    failedChannels: number;
    details: Array<{ channelId: string; success: boolean; error?: string }>;
  }> {
    console.log('🧹 Starting legacy cache cleanup...');
    
    const results = {
      cleanedChannels: 0,
      failedChannels: 0,
      details: [] as Array<{ channelId: string; success: boolean; error?: string }>,
    };

    try {
      const legacyKeys = await this.redisService.keys('liveVideoIdByChannel:*');
      
      for (const legacyKey of legacyKeys) {
        const channelId = legacyKey.replace('liveVideoIdByChannel:', '');
        const newKey = `liveStreamsByChannel:${channelId}`;
        
        try {
          // Verify new cache exists before deleting legacy
          const newCacheExists = await this.redisService.get(newKey);
          
          if (newCacheExists) {
            await this.redisService.del(legacyKey);
            results.cleanedChannels++;
            results.details.push({ channelId, success: true });
            console.log(`✅ Cleaned up legacy cache for channel ${channelId}`);
          } else {
            results.failedChannels++;
            results.details.push({ channelId, success: false, error: 'New cache not found' });
            console.warn(`⚠️ Skipping cleanup for channel ${channelId}: new cache not found`);
          }
        } catch (error) {
          results.failedChannels++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          results.details.push({ channelId, success: false, error: errorMessage });
          console.error(`❌ Failed to cleanup channel ${channelId}:`, error);
        }
      }

      console.log(`✅ Cleanup completed: ${results.cleanedChannels} channels cleaned, ${results.failedChannels} failed`);

    } catch (error) {
      console.error('❌ Cleanup process failed:', error);
      throw error;
    }

    return results;
  }

  /**
   * Rollback migration if needed (emergency function)
   */
  async rollbackMigration(): Promise<{
    rolledBackChannels: number;
    failedChannels: number;
    details: Array<{ channelId: string; success: boolean; error?: string }>;
  }> {
    console.log('🔄 Starting migration rollback...');
    
    const results = {
      rolledBackChannels: 0,
      failedChannels: 0,
      details: [] as Array<{ channelId: string; success: boolean; error?: string }>,
    };

    try {
      const newKeys = await this.redisService.keys('liveStreamsByChannel:*');
      
      for (const newKey of newKeys) {
        const channelId = newKey.replace('liveStreamsByChannel:', '');
        const legacyKey = `liveVideoIdByChannel:${channelId}`;
        
        try {
          const newCache = await this.redisService.get(newKey);
          
          if (newCache && Array.isArray(newCache) && newCache.length > 0) {
            // Extract first video ID from new cache
            const firstVideoId = newCache[0].videoId;
            
            // Restore to legacy format
            await this.redisService.set(legacyKey, firstVideoId, 3600);
            
            // Delete new cache
            await this.redisService.del(newKey);
            
            results.rolledBackChannels++;
            results.details.push({ channelId, success: true });
            console.log(`✅ Rolled back channel ${channelId}: ${firstVideoId}`);
          } else {
            results.failedChannels++;
            results.details.push({ channelId, success: false, error: 'Invalid new cache format' });
            console.warn(`⚠️ Invalid new cache format for channel ${channelId}`);
          }
        } catch (error) {
          results.failedChannels++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          results.details.push({ channelId, success: false, error: errorMessage });
          console.error(`❌ Failed to rollback channel ${channelId}:`, error);
        }
      }

      console.log(`✅ Rollback completed: ${results.rolledBackChannels} channels rolled back, ${results.failedChannels} failed`);

    } catch (error) {
      console.error('❌ Rollback process failed:', error);
      throw error;
    }

    return results;
  }

  /**
   * Print migration status to console (for manual inspection)
   */
  async printMigrationStatus(): Promise<void> {
    const status = await this.getMigrationStatus();
    
    console.log('\n📊 Migration Status:');
    console.log(`Legacy entries: ${status.legacyEntries}`);
    console.log(`New entries: ${status.newEntries}`);
    console.log(`Migrated channels: ${status.migratedChannels}`);
    console.log(`Pending channels: ${status.pendingChannels}`);
    
    if (status.details.length > 0) {
      console.log('\n📋 Channel Details:');
      status.details.forEach(detail => {
        const statusIcon = detail.status === 'migrated' ? '✅' : detail.status === 'pending' ? '⏳' : '❌';
        console.log(`${statusIcon} ${detail.channelId}: ${detail.status}`);
      });
    }
  }
}
