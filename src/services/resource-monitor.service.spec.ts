import { ResourceMonitorService } from './resource-monitor.service';
import { SentryService } from '../sentry/sentry.service';
import * as os from 'os';
import * as v8 from 'v8';

// Mock the os module. Solo queda lo que usa el monitor de CPU y los datos de
// plataforma: la memoria ya no se mide con os.totalmem()/os.freemem() porque
// dentro de un contenedor reportan la memoria del host, no la del proceso.
jest.mock('os', () => ({
  cpus: jest.fn(),
  uptime: jest.fn(),
  platform: jest.fn(),
  arch: jest.fn(),
}));

jest.mock('v8', () => ({
  getHeapStatistics: jest.fn(),
}));

const GB = 1024 * 1024 * 1024;

describe('ResourceMonitorService', () => {
  let service: ResourceMonitorService;
  let mockSentryService: jest.Mocked<SentryService>;

  /** Fija heap usado y techo de heap para que el porcentaje sea determinista. */
  const setHeap = (
    heapUsed: number,
    heapLimit: number,
    extra: Partial<NodeJS.MemoryUsage> = {},
  ) => {
    jest.spyOn(process, 'memoryUsage').mockReturnValue({
      rss: 5 * GB,
      heapTotal: heapUsed,
      heapUsed,
      external: 1 * GB,
      arrayBuffers: 0,
      ...extra,
    } as NodeJS.MemoryUsage);
    (v8.getHeapStatistics as jest.Mock).mockReturnValue({
      heap_size_limit: heapLimit,
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockSentryService = {
      captureMessage: jest.fn(),
      captureException: jest.fn(),
      setTag: jest.fn(),
      addBreadcrumb: jest.fn(),
    } as any;

    // Default: 4GB de heap usado sobre un techo de 8GB = 50%
    setHeap(4 * GB, 8 * GB);

    (os.cpus as jest.Mock).mockReturnValue([
      {
        times: { user: 100, nice: 0, sys: 50, idle: 850, irq: 0 },
      },
    ]);
    (os.uptime as jest.Mock).mockReturnValue(3600);
    (os.platform as jest.Mock).mockReturnValue('linux');
    (os.arch as jest.Mock).mockReturnValue('x64');

    service = new ResourceMonitorService(mockSentryService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    // Clean up any intervals that might be running
    if (service['monitoringInterval']) {
      clearInterval(service['monitoringInterval']);
    }
  });

  describe('onModuleInit', () => {
    it('starts monitoring interval', () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');

      service.onModuleInit();

      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 30000);

      // Clean up the interval immediately
      if (service['monitoringInterval']) {
        clearInterval(service['monitoringInterval']);
      }
    });
  });

  describe('checkResources', () => {
    it('logs current resource usage', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      service['checkResources']();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('📊 Resources: Memory 50.0%, CPU'),
      );
    });

    it('triggers high memory usage alert when heap > 85% of the limit', () => {
      setHeap(900, 1000); // 90%

      service['checkResources']();

      expect(mockSentryService.captureMessage).toHaveBeenCalledWith(
        expect.stringContaining(
          'Server Resource Warning - Memory usage at 90.0%',
        ),
        'warning',
        expect.objectContaining({
          service: 'server',
          error_type: 'high_memory_usage',
          heap_used_percent_of_limit: 90,
          threshold: 85,
        }),
      );

      expect(mockSentryService.setTag).toHaveBeenCalledWith(
        'service',
        'server',
      );
      expect(mockSentryService.setTag).toHaveBeenCalledWith(
        'error_type',
        'high_memory_usage',
      );
    });

    it('triggers critical memory usage alert when heap > 95% of the limit', () => {
      setHeap(970, 1000); // 97%

      // Reset the last alert time to ensure critical alert can fire
      (service as any).lastCriticalMemoryAlert = 0;

      service['checkResources']();

      expect(mockSentryService.captureMessage).toHaveBeenCalledWith(
        expect.stringContaining(
          'Server Resource Critical - Memory usage at 97.0%',
        ),
        'error',
        expect.objectContaining({
          service: 'server',
          error_type: 'critical_memory_usage',
          heap_used_percent_of_limit: 97,
          threshold: 95,
        }),
      );

      expect(mockSentryService.setTag).toHaveBeenCalledWith(
        'service',
        'server',
      );
      expect(mockSentryService.setTag).toHaveBeenCalledWith(
        'error_type',
        'critical_memory_usage',
      );
    });

    it('reports rss and external separately from the heap percentage', () => {
      // Un RSS enorme con el heap tranquilo es el caso que hay que poder
      // distinguir: no es un leak de objetos JS sino consumo off-heap.
      setHeap(900, 1000, { rss: 3 * GB, external: 2 * GB });

      service['checkResources']();

      expect(mockSentryService.captureMessage).toHaveBeenCalledWith(
        expect.any(String),
        'warning',
        expect.objectContaining({
          heap_used_percent_of_limit: 90,
          rss: '3 GB',
          external: '2 GB',
        }),
      );
    });

    it('triggers critical CPU usage alert when CPU > 90%', () => {
      // Mock 95% CPU usage
      (os.cpus as jest.Mock).mockReturnValue([
        {
          times: { user: 950, nice: 0, sys: 30, idle: 20, irq: 0 },
        },
      ]);

      // Reset the last alert time to ensure critical alert can fire
      (service as any).lastCriticalCpuAlert = 0;

      service['checkResources']();

      expect(mockSentryService.captureMessage).toHaveBeenCalledWith(
        expect.stringContaining('Server Resource Critical - CPU usage at'),
        'error',
        expect.objectContaining({
          service: 'server',
          error_type: 'critical_cpu_usage',
          threshold: 90,
        }),
      );

      expect(mockSentryService.setTag).toHaveBeenCalledWith(
        'service',
        'server',
      );
      expect(mockSentryService.setTag).toHaveBeenCalledWith(
        'error_type',
        'critical_cpu_usage',
      );
    });

    it('does not trigger alerts when resources are normal', () => {
      // Mock normal usage (50% heap, 30% CPU)
      setHeap(500, 1000);
      (os.cpus as jest.Mock).mockReturnValue([
        {
          times: { user: 300, nice: 0, sys: 100, idle: 600, irq: 0 },
        },
      ]);

      service['checkResources']();

      expect(mockSentryService.captureMessage).not.toHaveBeenCalled();
    });

    it('does not alert on a high rss while the heap stays healthy', () => {
      // Esto es exactamente lo que el monitor no podia ver antes: medir el host
      // hacia que el porcentaje no tuviera relacion con el proceso.
      setHeap(200, 1000, { rss: 7 * GB });
      (os.cpus as jest.Mock).mockReturnValue([
        {
          times: { user: 300, nice: 0, sys: 100, idle: 600, irq: 0 },
        },
      ]);

      service['checkResources']();

      expect(mockSentryService.captureMessage).not.toHaveBeenCalled();
    });

    it('prevents spam by only alerting once every 5 minutes', () => {
      // Mock high memory usage
      setHeap(900, 1000);

      // First call
      service['checkResources']();
      expect(mockSentryService.captureMessage).toHaveBeenCalledTimes(1);

      // Second call immediately after (should not trigger)
      service['checkResources']();
      expect(mockSentryService.captureMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe('getMemoryUsage', () => {
    it('reports heap usage against the V8 limit, not the host memory', () => {
      setHeap(4 * GB, 8 * GB, { rss: 5 * GB, external: 1 * GB });

      const result = service['getMemoryUsage']();

      expect(result).toEqual({
        heapUsed: '4 GB',
        heapTotal: '4 GB',
        heapLimit: '8 GB',
        rss: '5 GB',
        external: '1 GB',
        percentage: 50,
      });
    });

    it('handles a zero heap limit without producing NaN', () => {
      setHeap(0, 0);

      const result = service['getMemoryUsage']();

      expect(result.percentage).toBe(0);
    });

    it('reports 100% when the heap has reached its limit', () => {
      setHeap(1000, 1000);

      const result = service['getMemoryUsage']();

      expect(result.percentage).toBe(100);
    });
  });

  describe('getCpuUsage', () => {
    it('calculates CPU usage correctly', () => {
      (os.cpus as jest.Mock).mockReturnValue([
        {
          times: { user: 100, nice: 0, sys: 50, idle: 850, irq: 0 },
        },
      ]);

      const result = service['getCpuUsage']();

      // Expected: (1000 - 850) / 1000 * 100 = 15%
      expect(result).toBeCloseTo(15, 1);
    });

    it('handles multiple CPU cores', () => {
      (os.cpus as jest.Mock).mockReturnValue([
        {
          times: { user: 100, nice: 0, sys: 50, idle: 850, irq: 0 },
        },
        {
          times: { user: 200, nice: 0, sys: 100, idle: 700, irq: 0 },
        },
      ]);

      const result = service['getCpuUsage']();

      // Average of both cores
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(100);
    });
  });

  describe('formatBytes', () => {
    it('formats bytes correctly', () => {
      expect(service['formatBytes'](1024)).toBe('1 KB');
      expect(service['formatBytes'](1024 * 1024)).toBe('1 MB');
      expect(service['formatBytes'](1024 * 1024 * 1024)).toBe('1 GB');
      expect(service['formatBytes'](0)).toBe('0 Bytes');
    });
  });

  describe('getResourceStats', () => {
    it('returns comprehensive resource statistics', () => {
      const result = service.getResourceStats();

      expect(result).toEqual({
        memory: {
          heapUsed: '4 GB',
          heapTotal: '4 GB',
          heapLimit: '8 GB',
          rss: '5 GB',
          external: '1 GB',
          percentage: 50,
        },
        cpu: expect.any(Number),
        uptime: 3600,
        platform: 'linux',
        arch: 'x64',
        nodeVersion: process.version,
      });
    });
  });

  describe('onModuleDestroy', () => {
    it('clears monitoring interval', () => {
      // First initialize the service to set up the interval
      service.onModuleInit();

      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      service.onModuleDestroy();

      expect(clearIntervalSpy).toHaveBeenCalled();
    });
  });
});
