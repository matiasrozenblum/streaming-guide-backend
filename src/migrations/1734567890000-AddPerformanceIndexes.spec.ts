import { MigrationInterface, QueryRunner } from "typeorm";

describe('AddPerformanceIndexes Migration', () => {
  let migration: MigrationInterface;
  let mockQueryRunner: jest.Mocked<QueryRunner>;

  beforeEach(() => {
    // Import the migration class
    const migrationModule = require('./1734567890000-AddPerformanceIndexes');
    migration = new migrationModule.AddPerformanceIndexes1734567890000();
    
    mockQueryRunner = {
      query: jest.fn().mockResolvedValue(undefined),
    } as any;
  });

  describe('up', () => {
    it('should create all performance indexes', async () => {
      await migration.up(mockQueryRunner);

      expect(mockQueryRunner.query).toHaveBeenCalledTimes(6);
      
      // Check that all expected indexes are created
      const queryCalls = mockQueryRunner.query.mock.calls;
      
      expect(queryCalls[0][0]).toContain('idx_schedule_day_time_visible');
      expect(queryCalls[0][0]).toContain('CREATE INDEX CONCURRENTLY');
      expect(queryCalls[0][0]).toContain('schedule');
      expect(queryCalls[0][0]).toContain('day_of_week');
      expect(queryCalls[0][0]).toContain('start_time');

      expect(queryCalls[1][0]).toContain('idx_program_channel_live');
      expect(queryCalls[1][0]).toContain('program');
      expect(queryCalls[1][0]).toContain('channel_id');
      expect(queryCalls[1][0]).toContain('is_live');

      expect(queryCalls[2][0]).toContain('idx_channel_visible_order');
      expect(queryCalls[2][0]).toContain('channel');
      expect(queryCalls[2][0]).toContain('is_visible');
      expect(queryCalls[2][0]).toContain('order');

      expect(queryCalls[3][0]).toContain('idx_user_subscription_active');
      expect(queryCalls[3][0]).toContain('user_subscription');
      expect(queryCalls[3][0]).toContain('user_id');
      expect(queryCalls[3][0]).toContain('is_active');

      expect(queryCalls[4][0]).toContain('idx_device_device_id');
      expect(queryCalls[4][0]).toContain('device');
      expect(queryCalls[4][0]).toContain('device_id');

      expect(queryCalls[5][0]).toContain('idx_program_panelist_program_id');
      expect(queryCalls[5][0]).toContain('program_panelist');
      expect(queryCalls[5][0]).toContain('program_id');
    });

    it('should use CONCURRENTLY for non-blocking index creation', async () => {
      await migration.up(mockQueryRunner);

      const queryCalls = mockQueryRunner.query.mock.calls;
      
      // All CREATE INDEX statements should use CONCURRENTLY
      queryCalls.forEach(call => {
        expect(call[0]).toContain('CREATE INDEX CONCURRENTLY');
      });
    });

    it('should use IF NOT EXISTS to prevent errors on re-run', async () => {
      await migration.up(mockQueryRunner);

      const queryCalls = mockQueryRunner.query.mock.calls;
      
      // All CREATE INDEX statements should use IF NOT EXISTS
      queryCalls.forEach(call => {
        expect(call[0]).toContain('IF NOT EXISTS');
      });
    });

    it('should include WHERE clauses for partial indexes', async () => {
      await migration.up(mockQueryRunner);

      const queryCalls = mockQueryRunner.query.mock.calls;
      
      // Check for WHERE clauses in specific indexes
      expect(queryCalls[0][0]).toContain('WHERE "day_of_week" IS NOT NULL');
      expect(queryCalls[1][0]).toContain('WHERE "channel_id" IS NOT NULL');
      expect(queryCalls[2][0]).toContain('WHERE "is_visible" = true');
      expect(queryCalls[3][0]).toContain('WHERE "is_active" = true');
    });
  });

  describe('down', () => {
    it('should drop all created indexes', async () => {
      await migration.down(mockQueryRunner);

      expect(mockQueryRunner.query).toHaveBeenCalledTimes(6);
      
      const queryCalls = mockQueryRunner.query.mock.calls;
      
      expect(queryCalls[0][0]).toContain('DROP INDEX IF EXISTS "idx_schedule_day_time_visible"');
      expect(queryCalls[1][0]).toContain('DROP INDEX IF EXISTS "idx_program_channel_live"');
      expect(queryCalls[2][0]).toContain('DROP INDEX IF EXISTS "idx_channel_visible_order"');
      expect(queryCalls[3][0]).toContain('DROP INDEX IF EXISTS "idx_user_subscription_active"');
      expect(queryCalls[4][0]).toContain('DROP INDEX IF EXISTS "idx_device_device_id"');
      expect(queryCalls[5][0]).toContain('DROP INDEX IF EXISTS "idx_program_panelist_program_id"');
    });

    it('should use IF EXISTS to prevent errors', async () => {
      await migration.down(mockQueryRunner);

      const queryCalls = mockQueryRunner.query.mock.calls;
      
      // All DROP INDEX statements should use IF EXISTS
      queryCalls.forEach(call => {
        expect(call[0]).toContain('DROP INDEX IF EXISTS');
      });
    });
  });

  describe('Migration Properties', () => {
    it('should have correct name', () => {
      expect(migration.name).toBe('AddPerformanceIndexes1734567890000');
    });
  });
});
