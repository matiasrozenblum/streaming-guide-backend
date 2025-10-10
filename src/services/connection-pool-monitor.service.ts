import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class ConnectionPoolMonitorService implements OnModuleInit {
  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit() {
    // Log initial pool status
    this.logPoolStatus();
  }

  /**
   * Log connection pool status every minute
   * Helps monitor database connection usage and detect connection leaks
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async logPoolStatus() {
    try {
      // TypeORM uses node-postgres (pg) pool underneath
      const pool = (this.dataSource.driver as any).master;
      
      if (pool && pool.pool) {
        const poolStats = {
          total: pool.pool.totalCount || 0,           // Total connections created
          idle: pool.pool.idleCount || 0,             // Idle connections available
          waiting: pool.pool.waitingCount || 0,       // Requests waiting for connection
          active: (pool.pool.totalCount || 0) - (pool.pool.idleCount || 0), // Active connections
          max: pool.pool.options.max || 0,            // Max pool size
        };

        const utilizationPercent = poolStats.max > 0 
          ? ((poolStats.active / poolStats.max) * 100).toFixed(1)
          : '0.0';

        console.log(
          `[DB-POOL] 📊 Status: ` +
          `Active: ${poolStats.active}/${poolStats.max} (${utilizationPercent}%) | ` +
          `Idle: ${poolStats.idle} | ` +
          `Waiting: ${poolStats.waiting} | ` +
          `Total: ${poolStats.total}`
        );

        // Alert if pool is heavily utilized
        if (poolStats.active / poolStats.max > 0.8) {
          console.warn(
            `⚠️  [DB-POOL] High utilization detected: ${poolStats.active}/${poolStats.max} connections in use (${utilizationPercent}%)`
          );
        }

        // Alert if requests are waiting
        if (poolStats.waiting > 0) {
          console.warn(
            `🚨 [DB-POOL] ${poolStats.waiting} requests waiting for database connections!`
          );
        }

        return poolStats;
      } else {
        console.warn('[DB-POOL] Could not access connection pool information');
        return null;
      }
    } catch (error) {
      console.error('[DB-POOL] Error getting pool status:', error.message);
      return null;
    }
  }

  /**
   * Get current pool status on demand
   * Useful for API endpoints or debugging
   */
  async getPoolStatus() {
    try {
      const pool = (this.dataSource.driver as any).master;
      
      if (pool && pool.pool) {
        return {
          total: pool.pool.totalCount || 0,
          idle: pool.pool.idleCount || 0,
          waiting: pool.pool.waitingCount || 0,
          active: (pool.pool.totalCount || 0) - (pool.pool.idleCount || 0),
          max: pool.pool.options.max || 0,
          utilizationPercent: pool.pool.options.max > 0
            ? (((pool.pool.totalCount - pool.pool.idleCount) / pool.pool.options.max) * 100).toFixed(1)
            : '0.0',
        };
      }
      return null;
    } catch (error) {
      console.error('[DB-POOL] Error getting pool status:', error.message);
      return null;
    }
  }
}

