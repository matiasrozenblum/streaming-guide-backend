import { ResourceMonitorService } from './resource-monitor.service';
import { SentryService } from '../sentry/sentry.service';
import * as os from 'os';

// Mock the os module
jest.mock('os', () => ({
  totalmem: jest.fn(),
  freemem: jest.fn(),
  cpus: jest.fn(),
  uptime: jest.fn(),
  platform: jest.fn(),
  arch: jest.fn(),
}));

describe('ResourceMonitorService', () => {
  let service: ResourceMonitorService;
  let mockSentryService: jest.Mocked<SentryService>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockSentryService = {
      captureMessage: jest.fn(),
      captureException: jest.fn(),
      setTag: jest.fn(),
      addBreadcrumb: jest.fn(),
    } as any;

    // Set up default OS mocks
    (os.totalmem as jest.Mock).mockReturnValue(8 * 1024 * 1024 * 1024); // 8GB
    (os.freemem as jest.Mock).mockReturnValue(4 * 1024 * 1024 * 1024); // 4GB
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
    jest.clearAllMocks();
    // Clean up any intervals that might be running
    if (service['monitoringInterval']) {
      clearInterval(service['monitoringInterval']);
    }
  });

  afterAll(() => {
    // Ensure all intervals are cleared
    jest.restoreAllMocks();
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
        expect.stringContaining('📊 Resources: Memory 50.0%, CPU')
      );
    });

    it('triggers high memory usage alert when memory > 85%', () => {
      // Mock 90% memory usage
      (os.totalmem as jest.Mock).mockReturnValue(1000);
      (os.freemem as jest.Mock).mockReturnValue(100); // 10% free = 90% used
      
      service['checkResources']();
      
      expect(mockSentryService.captureMessage).toHaveBeenCalledWith(
        expect.stringContaining('Server Resource Warning - Memory usage at 90.0%'),
        'warning',
        expect.objectContaining({
          service: 'server',
          error_type: 'high_memory_usage',
          memory_percentage: 90,
          threshold: 85,
        })
      );
      
      expect(mockSentryService.setTag).toHaveBeenCalledWith('service', 'server');
      expect(mockSentryService.setTag).toHaveBeenCalledWith('error_type', 'high_memory_usage');
    });

    it('triggers critical memory usage alert when memory > 95%', () => {
      // Mock 97% memory usage
      (os.totalmem as jest.Mock).mockReturnValue(1000);
      (os.freemem as jest.Mock).mockReturnValue(30); // 3% free = 97% used
      
      // Reset the last alert time to ensure critical alert can fire
      (service as any).lastCriticalMemoryAlert = 0;
      
      service['checkResources']();
      
      expect(mockSentryService.captureMessage).toHaveBeenCalledWith(
        expect.stringContaining('Server Resource Critical - Memory usage at 97.0%'),
        'error',
        expect.objectContaining({
          service: 'server',
          error_type: 'critical_memory_usage',
          memory_percentage: 97,
          threshold: 95,
        })
      );
      
      expect(mockSentryService.setTag).toHaveBeenCalledWith('service', 'server');
      expect(mockSentryService.setTag).toHaveBeenCalledWith('error_type', 'critical_memory_usage');
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
        })
      );
      
      expect(mockSentryService.setTag).toHaveBeenCalledWith('service', 'server');
      expect(mockSentryService.setTag).toHaveBeenCalledWith('error_type', 'critical_cpu_usage');
    });

    it('does not trigger alerts when resources are normal', () => {
      // Mock normal usage (50% memory, 30% CPU)
      (os.totalmem as jest.Mock).mockReturnValue(1000);
      (os.freemem as jest.Mock).mockReturnValue(500);
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
      (os.totalmem as jest.Mock).mockReturnValue(1000);
      (os.freemem as jest.Mock).mockReturnValue(100);
      
      // First call
      service['checkResources']();
      expect(mockSentryService.captureMessage).toHaveBeenCalledTimes(1);
      
      // Second call immediately after (should not trigger)
      service['checkResources']();
      expect(mockSentryService.captureMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe('getMemoryUsage', () => {
    it('calculates memory usage correctly', () => {
      (os.totalmem as jest.Mock).mockReturnValue(8 * 1024 * 1024 * 1024); // 8GB
      (os.freemem as jest.Mock).mockReturnValue(4 * 1024 * 1024 * 1024); // 4GB
      
      const result = service['getMemoryUsage']();
      
      expect(result).toEqual({
        total: '8 GB',
        used: '4 GB',
        free: '4 GB',
        percentage: 50,
      });
    });

    it('handles zero memory', () => {
      (os.totalmem as jest.Mock).mockReturnValue(0);
      (os.freemem as jest.Mock).mockReturnValue(0);
      
      const result = service['getMemoryUsage']();
      
      // When total is 0, percentage should be 0 to avoid NaN
      expect(result.percentage).toBe(0);
    });

    it('handles edge case where total memory is very small', () => {
      (os.totalmem as jest.Mock).mockReturnValue(1);
      (os.freemem as jest.Mock).mockReturnValue(0);
      
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
          total: '8 GB',
          used: '4 GB',
          free: '4 GB',
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