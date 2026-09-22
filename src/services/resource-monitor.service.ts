import { Injectable, OnModuleInit } from '@nestjs/common';
import { SentryService } from '../sentry/sentry.service';
import * as os from 'os';
import * as v8 from 'v8';

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
    console.log(
      `📊 Resources: Memory ${memoryUsage.percentage.toFixed(1)}%, CPU ${cpuUsage.toFixed(1)}%`,
    );

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
            heap_used_percent_of_limit: memoryUsage.percentage,
            heap_used: memoryUsage.heapUsed,
            heap_total: memoryUsage.heapTotal,
            heap_limit: memoryUsage.heapLimit,
            // rss y external no entran en el porcentaje: sirven para distinguir
            // un leak de objetos JS de un crecimiento off-heap.
            rss: memoryUsage.rss,
            external: memoryUsage.external,
            threshold: 85,
            timestamp: new Date().toISOString(),
          },
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
            heap_used_percent_of_limit: memoryUsage.percentage,
            heap_used: memoryUsage.heapUsed,
            heap_total: memoryUsage.heapTotal,
            heap_limit: memoryUsage.heapLimit,
            // rss y external no entran en el porcentaje: sirven para distinguir
            // un leak de objetos JS de un crecimiento off-heap.
            rss: memoryUsage.rss,
            external: memoryUsage.external,
            threshold: 95,
            timestamp: new Date().toISOString(),
          },
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
          },
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
          },
        );

        this.sentryService.setTag('service', 'server');
        this.sentryService.setTag('error_type', 'critical_cpu_usage');
        this.lastCriticalCpuAlert = now;
      }
    }
  }

  /**
   * Mide el proceso, no la maquina.
   *
   * Antes esto usaba `os.totalmem()` / `os.freemem()`, que dentro de un
   * contenedor reportan la memoria del **host** y no la del cgroup ni la del
   * proceso. En Railway eso daba una cifra que no tiene relacion con lo que
   * consume el servicio, y por eso los umbrales de 85% y 95% jamas dispararon
   * una alerta aun con el backend estacionado en 1.2-1.5 GB.
   *
   * El porcentaje ahora es heap usado sobre el techo que V8 impone al proceso,
   * que es la unica razon por la que un proceso Node muere por OOM de heap.
   * `rss` va aparte en el contexto: crece con memoria off-heap (buffers de
   * ioredis/HTTP, y Chromium cuando corre un scraper) que este porcentaje no
   * cubre a proposito.
   */
  private getMemoryUsage() {
    const mem = process.memoryUsage();
    const heapLimit = v8.getHeapStatistics().heap_size_limit;
    const percentage = heapLimit > 0 ? (mem.heapUsed / heapLimit) * 100 : 0;

    return {
      heapUsed: this.formatBytes(mem.heapUsed),
      heapTotal: this.formatBytes(mem.heapTotal),
      heapLimit: this.formatBytes(heapLimit),
      rss: this.formatBytes(mem.rss),
      external: this.formatBytes(mem.external),
      percentage,
    };
  }

  private getCpuUsage(): number {
    // Simple CPU usage calculation
    // In production, you might want to use a more sophisticated method
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach((cpu) => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });

    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - (idle / total) * 100;

    return usage;
  }

  private formatBytes(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
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
