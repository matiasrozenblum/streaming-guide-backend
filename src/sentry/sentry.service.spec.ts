import { SentryService } from './sentry.service';
import * as Sentry from '@sentry/node';

// Mock Sentry
jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  withScope: jest.fn((callback) => callback({
    setExtra: jest.fn(),
  })),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  setUser: jest.fn(),
  setTag: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

describe('SentryService', () => {
  let service: SentryService;
  let mockScope: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockScope = {
      setExtra: jest.fn(),
    };
    (Sentry.withScope as jest.Mock).mockImplementation((callback) => callback(mockScope));
    service = new SentryService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('initializes Sentry with correct configuration in production', () => {
      const originalEnv = process.env.SENTRY_DSN;
      const originalNodeEnv = process.env.NODE_ENV;
      
      process.env.SENTRY_DSN = 'test-dsn';
      process.env.NODE_ENV = 'production';
      
      // Create new service instance with production environment
      const prodService = new SentryService();
      prodService.onModuleInit();
      
      expect(Sentry.init).toHaveBeenCalledWith({
        dsn: 'test-dsn',
        environment: 'production',
        tracesSampleRate: 1.0,
        beforeSend: expect.any(Function),
      });
      
      // Restore environment
      process.env.SENTRY_DSN = originalEnv;
      process.env.NODE_ENV = originalNodeEnv;
    });

    it('uses production environment when NODE_ENV is production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      // Create new service instance with production environment
      const prodService = new SentryService();
      prodService.onModuleInit();
      
      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: 'production',
        })
      );
      
      process.env.NODE_ENV = originalEnv;
    });

    it('skips Sentry initialization in non-production environments', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'staging';
      
      // Create new service instance with staging environment
      const stagingService = new SentryService();
      stagingService.onModuleInit();
      
      expect(Sentry.init).not.toHaveBeenCalled();
      
      process.env.NODE_ENV = originalEnv;
    });

    it('filters out health check errors in beforeSend', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      // Create new service instance with production environment
      const prodService = new SentryService();
      prodService.onModuleInit();
      
      const beforeSend = (Sentry.init as jest.Mock).mock.calls[0][0].beforeSend;
      
      const healthEvent = { request: { url: '/health' } };
      const normalEvent = { request: { url: '/api/schedules' } };
      
      expect(beforeSend(healthEvent)).toBeNull();
      expect(beforeSend(normalEvent)).toBe(normalEvent);
      
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('captureException', () => {
    it('captures exception with context in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const prodService = new SentryService();
      const error = new Error('Test error');
      const context = { userId: '123', action: 'test' };
      
      prodService.captureException(error, context);
      
      expect(Sentry.withScope).toHaveBeenCalled();
      expect(mockScope.setExtra).toHaveBeenCalledWith('userId', '123');
      expect(mockScope.setExtra).toHaveBeenCalledWith('action', 'test');
      expect(Sentry.captureException).toHaveBeenCalledWith(error);
      
      process.env.NODE_ENV = originalEnv;
    });

    it('captures exception without context in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const prodService = new SentryService();
      const error = new Error('Test error');
      
      prodService.captureException(error);
      
      expect(Sentry.withScope).toHaveBeenCalled();
      expect(mockScope.setExtra).not.toHaveBeenCalled();
      expect(Sentry.captureException).toHaveBeenCalledWith(error);
      
      process.env.NODE_ENV = originalEnv;
    });

    it('skips capturing exception in non-production environments', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'staging';
      
      const stagingService = new SentryService();
      const error = new Error('Test error');
      
      stagingService.captureException(error);
      
      expect(Sentry.withScope).not.toHaveBeenCalled();
      expect(Sentry.captureException).not.toHaveBeenCalled();
      
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('captureMessage', () => {
    it('captures message with default error level in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const prodService = new SentryService();
      const message = 'Test message';
      
      prodService.captureMessage(message);
      
      expect(Sentry.withScope).toHaveBeenCalled();
      expect(Sentry.captureMessage).toHaveBeenCalledWith(message, 'error');
      
      process.env.NODE_ENV = originalEnv;
    });

    it('captures message with custom level in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const prodService = new SentryService();
      const message = 'Test warning';
      
      prodService.captureMessage(message, 'warning');
      
      expect(Sentry.withScope).toHaveBeenCalled();
      expect(Sentry.captureMessage).toHaveBeenCalledWith(message, 'warning');
      
      process.env.NODE_ENV = originalEnv;
    });

    it('captures message with context in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const prodService = new SentryService();
      const message = 'Test message';
      const context = { service: 'api', error_type: 'timeout' };
      
      prodService.captureMessage(message, 'error', context);
      
      expect(Sentry.withScope).toHaveBeenCalled();
      expect(mockScope.setExtra).toHaveBeenCalledWith('service', 'api');
      expect(mockScope.setExtra).toHaveBeenCalledWith('error_type', 'timeout');
      expect(Sentry.captureMessage).toHaveBeenCalledWith(message, 'error');
      
      process.env.NODE_ENV = originalEnv;
    });

    it('skips capturing message in non-production environments', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'staging';
      
      const stagingService = new SentryService();
      const message = 'Test message';
      
      stagingService.captureMessage(message);
      
      expect(Sentry.withScope).not.toHaveBeenCalled();
      expect(Sentry.captureMessage).not.toHaveBeenCalled();
      
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('setUser', () => {
    it('sets user context in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const prodService = new SentryService();
      const user = { id: '123', email: 'test@example.com', username: 'testuser' };
      
      prodService.setUser(user);
      
      expect(Sentry.setUser).toHaveBeenCalledWith(user);
      
      process.env.NODE_ENV = originalEnv;
    });

    it('skips setting user in non-production environments', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'staging';
      
      const stagingService = new SentryService();
      const user = { id: '123', email: 'test@example.com', username: 'testuser' };
      
      stagingService.setUser(user);
      
      expect(Sentry.setUser).not.toHaveBeenCalled();
      
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('setTag', () => {
    it('sets tag in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const prodService = new SentryService();
      prodService.setTag('service', 'api');
      
      expect(Sentry.setTag).toHaveBeenCalledWith('service', 'api');
      
      process.env.NODE_ENV = originalEnv;
    });

    it('skips setting tag in non-production environments', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'staging';
      
      const stagingService = new SentryService();
      stagingService.setTag('service', 'api');
      
      expect(Sentry.setTag).not.toHaveBeenCalled();
      
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('addBreadcrumb', () => {
    it('adds breadcrumb in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const prodService = new SentryService();
      const breadcrumb = {
        category: 'test',
        message: 'Test breadcrumb',
        level: 'info' as any,
      };
      
      prodService.addBreadcrumb(breadcrumb);
      
      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(breadcrumb);
      
      process.env.NODE_ENV = originalEnv;
    });

    it('skips adding breadcrumb in non-production environments', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'staging';
      
      const stagingService = new SentryService();
      const breadcrumb = {
        category: 'test',
        message: 'Test breadcrumb',
        level: 'info' as any,
      };
      
      stagingService.addBreadcrumb(breadcrumb);
      
      expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
      
      process.env.NODE_ENV = originalEnv;
    });
  });
}); 