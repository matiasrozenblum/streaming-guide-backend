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
    it('initializes Sentry with correct configuration', () => {
      const originalEnv = process.env.SENTRY_DSN;
      const originalNodeEnv = process.env.NODE_ENV;
      
      process.env.SENTRY_DSN = 'test-dsn';
      process.env.NODE_ENV = 'test';
      
      service.onModuleInit();
      
      expect(Sentry.init).toHaveBeenCalledWith({
        dsn: 'test-dsn',
        environment: 'test',
        tracesSampleRate: 1.0,
        beforeSend: expect.any(Function),
      });
      
      // Restore environment
      process.env.SENTRY_DSN = originalEnv;
      process.env.NODE_ENV = originalNodeEnv;
    });

    it('uses development environment when NODE_ENV is not set', () => {
      const originalEnv = process.env.NODE_ENV;
      delete process.env.NODE_ENV;
      
      service.onModuleInit();
      
      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: 'development',
        })
      );
      
      process.env.NODE_ENV = originalEnv;
    });

    it('filters out health check errors in beforeSend', () => {
      service.onModuleInit();
      
      const beforeSend = (Sentry.init as jest.Mock).mock.calls[0][0].beforeSend;
      
      const healthEvent = { request: { url: '/health' } };
      const normalEvent = { request: { url: '/api/schedules' } };
      
      expect(beforeSend(healthEvent)).toBeNull();
      expect(beforeSend(normalEvent)).toBe(normalEvent);
    });
  });

  describe('captureException', () => {
    it('captures exception with context', () => {
      const error = new Error('Test error');
      const context = { userId: '123', action: 'test' };
      
      service.captureException(error, context);
      
      expect(Sentry.withScope).toHaveBeenCalled();
      expect(mockScope.setExtra).toHaveBeenCalledWith('userId', '123');
      expect(mockScope.setExtra).toHaveBeenCalledWith('action', 'test');
      expect(Sentry.captureException).toHaveBeenCalledWith(error);
    });

    it('captures exception without context', () => {
      const error = new Error('Test error');
      
      service.captureException(error);
      
      expect(Sentry.withScope).toHaveBeenCalled();
      expect(mockScope.setExtra).not.toHaveBeenCalled();
      expect(Sentry.captureException).toHaveBeenCalledWith(error);
    });
  });

  describe('captureMessage', () => {
    it('captures message with default error level', () => {
      const message = 'Test message';
      
      service.captureMessage(message);
      
      expect(Sentry.withScope).toHaveBeenCalled();
      expect(Sentry.captureMessage).toHaveBeenCalledWith(message, 'error');
    });

    it('captures message with custom level', () => {
      const message = 'Test warning';
      
      service.captureMessage(message, 'warning');
      
      expect(Sentry.withScope).toHaveBeenCalled();
      expect(Sentry.captureMessage).toHaveBeenCalledWith(message, 'warning');
    });

    it('captures message with context', () => {
      const message = 'Test message';
      const context = { service: 'api', error_type: 'timeout' };
      
      service.captureMessage(message, 'error', context);
      
      expect(Sentry.withScope).toHaveBeenCalled();
      expect(mockScope.setExtra).toHaveBeenCalledWith('service', 'api');
      expect(mockScope.setExtra).toHaveBeenCalledWith('error_type', 'timeout');
      expect(Sentry.captureMessage).toHaveBeenCalledWith(message, 'error');
    });
  });

  describe('setUser', () => {
    it('sets user context', () => {
      const user = { id: '123', email: 'test@example.com', username: 'testuser' };
      
      service.setUser(user);
      
      expect(Sentry.setUser).toHaveBeenCalledWith(user);
    });
  });

  describe('setTag', () => {
    it('sets tag', () => {
      service.setTag('service', 'api');
      
      expect(Sentry.setTag).toHaveBeenCalledWith('service', 'api');
    });
  });

  describe('addBreadcrumb', () => {
    it('adds breadcrumb', () => {
      const breadcrumb = {
        category: 'test',
        message: 'Test breadcrumb',
        level: 'info' as any,
      };
      
      service.addBreadcrumb(breadcrumb);
      
      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(breadcrumb);
    });
  });
}); 