import { Injectable, OnModuleInit } from '@nestjs/common';
import { SentryService } from '../sentry/sentry.service';
import * as os from 'os';

@Injectable()
export class ResourceMonitorService implements OnModuleInit {
  private monitoringInterval: NodeJS.Timeout;
  private lastHighMemoryAlert: number = 0;
  private lastCriticalMemoryAlert: number = 0;
  private lastHighCpuAlert: number = 0;
  private lastCriticalCpuAlert: number = 0;

  constructor(private readonly sentryService: SentryService) {}

  onModuleInit() {
    // Start monitoring every 30 seconds
    this.monitoringInterval = setInterval(() => {
      this.checkResources();
    }, 30000); // 30 seconds

    console.log('🔍 Resource monitoring started');
  }

  private checkResources() {
    const memoryUsage = this.getMemoryUsage();
    const cpuUsage = this.getCpuUsage();

    // Log current resource usage
    console.log(`📊 Resources: Memory ${memoryUsage.percentage.toFixed(1)}%, CPU ${cpuUsage.toFixed(1)}%`);

    // Alert on high memory usage (P2 - High Priority)
    if (memoryUsage.percentage > 85) {
      const now = Date.now();
      // Only alert once every 5 minutes to avoid spam
      if (now - this.lastHighMemoryAlert > 300000) {
        this.sentryService.captureMessage(
          `Server Resource Warning - Memory usage at ${memoryUsage.percentage.toFixed(1)}%`,
          'warning',
          {
            service: 'server',
            error_type: 'high_memory_usage',
            memory_percentage: memoryUsage.percentage,
            memory_used: memoryUsage.used,
            memory_total: memoryUsage.total,
            memory_free: memoryUsage.free,
            threshold: 85,
            timestamp: new Date().toISOString(),
          }
        );

        this.sentryService.setTag('service', 'server');
        this.sentryService.setTag('error_type', 'high_memory_usage');
        this.lastHighMemoryAlert = now;
      }
    }

    // Alert on critical memory usage (P1 - Critical)
    if (memoryUsage.percentage > 95) {
      const now = Date.now();
      if (now - this.lastCriticalMemoryAlert > 300000) {
        this.sentryService.captureMessage(
          `Server Resource Critical - Memory usage at ${memoryUsage.percentage.toFixed(1)}%`,
          'error',
          {
            service: 'server',
            error_type: 'critical_memory_usage',
            memory_percentage: memoryUsage.percentage,
            memory_used: memoryUsage.used,
            memory_total: memoryUsage.total,
            memory_free: memoryUsage.free,
            threshold: 95,
            timestamp: new Date().toISOString(),
          }
        );

        this.sentryService.setTag('service', 'server');
        this.sentryService.setTag('error_type', 'critical_memory_usage');
        this.lastCriticalMemoryAlert = now;
      }
    }

    // Alert on high CPU usage (P2 - High Priority)
    if (cpuUsage > 80) {
      const now = Date.now();
      if (now - this.lastHighCpuAlert > 300000) {
        this.sentryService.captureMessage(
          `Server Resource Warning - CPU usage at ${cpuUsage.toFixed(1)}%`,
          'warning',
          {
            service: 'server',
            error_type: 'high_cpu_usage',
            cpu_percentage: cpuUsage,
            cpu_cores: os.cpus().length,
            threshold: 80,
            timestamp: new Date().toISOString(),
          }
        );

        this.sentryService.setTag('service', 'server');
        this.sentryService.setTag('error_type', 'high_cpu_usage');
        this.lastHighCpuAlert = now;
      }
    }

    // Alert on critical CPU usage (P1 - Critical)
    if (cpuUsage > 90) {
      const now = Date.now();
      if (now - this.lastCriticalCpuAlert > 300000) {
        this.sentryService.captureMessage(
          `Server Resource Critical - CPU usage at ${cpuUsage.toFixed(1)}%`,
          'error',
          {
            service: 'server',
            error_type: 'critical_cpu_usage',
            cpu_percentage: cpuUsage,
            cpu_cores: os.cpus().length,
            threshold: 90,
            timestamp: new Date().toISOString(),
          }
        );

        this.sentryService.setTag('service', 'server');
        this.sentryService.setTag('error_type', 'critical_cpu_usage');
        this.lastCriticalCpuAlert = now;
      }
    }
  }

  private getMemoryUsage() {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    const percentage = total > 0 ? (used / total) * 100 : 0;

    return {
      total: this.formatBytes(total),
      used: this.formatBytes(used),
      free: this.formatBytes(free),
      percentage,
    };
  }

  private getCpuUsage(): number {
    // Simple CPU usage calculation
    // In production, you might want to use a more sophisticated method
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });

    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - (idle / total * 100);

    return usage;
  }

  private formatBytes(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  // Method to get current resource stats
  getResourceStats() {
    const memory = this.getMemoryUsage();
    const cpu = this.getCpuUsage();

    return {
      memory,
      cpu,
      uptime: os.uptime(),
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
    };
  }

  // Cleanup on module destroy
  onModuleDestroy() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
  }
} 