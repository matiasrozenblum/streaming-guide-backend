import { PerformanceInterceptor } from './performance.interceptor';
import { SentryService } from '../sentry/sentry.service';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError, timer } from 'rxjs';
import { map, delay } from 'rxjs/operators';

describe('PerformanceInterceptor', () => {
  let interceptor: PerformanceInterceptor;
  let mockSentryService: jest.Mocked<SentryService>;
  let mockExecutionContext: jest.Mocked<ExecutionContext>;
  let mockCallHandler: jest.Mocked<CallHandler>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockSentryService = {
      captureMessage: jest.fn(),
      captureException: jest.fn(),
      setTag: jest.fn(),
      addBreadcrumb: jest.fn(),
    } as any;

    mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          method: 'GET',
          url: '/api/schedules',
          route: { path: '/api/schedules' },
          headers: { 'user-agent': 'test-agent' },
          ip: '127.0.0.1',
        }),
        getResponse: jest.fn().mockReturnValue({}),
      }),
    } as any;

    mockCallHandler = {
      handle: jest.fn(),
    } as any;

    interceptor = new PerformanceInterceptor(mockSentryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('intercept', () => {
    it('adds breadcrumb for API request', () => {
      mockCallHandler.handle.mockReturnValue(of({ data: 'test' }));
      
      interceptor.intercept(mockExecutionContext, mockCallHandler);
      
      expect(mockSentryService.addBreadcrumb).toHaveBeenCalledWith({
        category: 'performance',
        message: 'API Request: GET /api/schedules',
        level: 'info',
        data: {
          method: 'GET',
          url: '/api/schedules',
          userAgent: 'test-agent',
          ip: '127.0.0.1',
          timestamp: expect.any(String),
        },
      });
    });

    it('logs performance metrics for successful response', (done) => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      mockCallHandler.handle.mockReturnValue(of({ data: 'test' }));
      
      const result = interceptor.intercept(mockExecutionContext, mockCallHandler);
      
      result.subscribe(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('📊 API Performance: GET /api/schedules')
        );
        done();
      });
    });

    it('does not trigger slow response alert for fast response', (done) => {
      mockCallHandler.handle.mockReturnValue(of({ data: 'test' }));
      
      const result = interceptor.intercept(mockExecutionContext, mockCallHandler);
      
      result.subscribe(() => {
        expect(mockSentryService.captureMessage).not.toHaveBeenCalled();
        done();
      });
    });

    it('does not trigger slow response alert for response > 6s (feature disabled)', (done) => {
      // Create a delayed observable with shorter delay for testing
      const delayedObservable = of({ data: 'test' }).pipe(delay(100));
      mockCallHandler.handle.mockReturnValue(delayedObservable);
      
      // Mock Date.now to simulate slow response
      const originalNow = Date.now;
      Date.now = jest.fn()
        .mockReturnValueOnce(0) // Start time
        .mockReturnValueOnce(7000); // End time (7 seconds later)
      
      const result = interceptor.intercept(mockExecutionContext, mockCallHandler);
      
      result.subscribe(() => {
        // The 6s alert is currently commented out in the interceptor
        expect(mockSentryService.captureMessage).not.toHaveBeenCalledWith(
          expect.stringContaining('API Performance Issue - GET /api/schedules taking'),
          'warning',
          expect.objectContaining({
            service: 'api',
            error_type: 'slow_response',
            endpoint: 'GET /api/schedules',
            threshold: 6000,
          })
        );
        
        Date.now = originalNow;
        done();
      });
    }, 10000); // Increase timeout to 10 seconds

    // TODO: Reactivate this test when we reactivate the critical slow response alert
    it.skip('triggers critical slow response alert for response > 15s', (done) => {
      // Create a delayed observable with shorter delay for testing
      const delayedObservable = of({ data: 'test' }).pipe(delay(100));
      mockCallHandler.handle.mockReturnValue(delayedObservable);
      
      // Mock Date.now to simulate critical slow response
      const originalNow = Date.now;
      let callCount = 0;
      Date.now = jest.fn(() => {
        callCount++;
        if (callCount === 1) return 0; // Start time
        return 16000; // End time (16 seconds later)
      });
      
      const result = interceptor.intercept(mockExecutionContext, mockCallHandler);
      
      result.subscribe({
        next: () => {
          // Small delay to ensure the tap operator finishes
          setTimeout(() => {
            expect(mockSentryService.captureMessage).toHaveBeenCalledWith(
              expect.stringContaining('API Critical Performance Issue - GET /api/schedules taking'),
              'error',
              expect.objectContaining({
                service: 'api',
                error_type: 'critical_slow_response',
                endpoint: 'GET /api/schedules',
                threshold: 15000,
              })
            );
            
            expect(mockSentryService.setTag).toHaveBeenCalledWith('service', 'api');
            expect(mockSentryService.setTag).toHaveBeenCalledWith('error_type', 'critical_slow_response');
            expect(mockSentryService.setTag).toHaveBeenCalledWith('endpoint', 'GET /api/schedules');
            
            Date.now = originalNow;
            done();
          }, 50);
        },
        error: (err) => {
          Date.now = originalNow;
          done(err);
        }
      });
    }, 10000); // Increase timeout to 10 seconds

    it('does not trigger slow response alert for critical slow response', (done) => {
      // Create a delayed observable with shorter delay for testing
      const delayedObservable = of({ data: 'test' }).pipe(delay(100));
      mockCallHandler.handle.mockReturnValue(delayedObservable);
      
      // Mock Date.now to simulate critical slow response
      const originalNow = Date.now;
      Date.now = jest.fn()
        .mockReturnValueOnce(0) // Start time
        .mockReturnValueOnce(12000); // End time (12 seconds later)
      
      const result = interceptor.intercept(mockExecutionContext, mockCallHandler);
      
      result.subscribe(() => {
        const slowResponseCalls = (mockSentryService.captureMessage as jest.Mock).mock.calls.filter(
          call => call[1] === 'warning'
        );
        
        expect(slowResponseCalls).toHaveLength(0);
        
        Date.now = originalNow;
        done();
      });
    }, 10000); // Increase timeout to 10 seconds

    it('handles API errors and reports them', (done) => {
      const error = new Error('API Error');
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockCallHandler.handle.mockReturnValue(throwError(() => error));
      
      const result = interceptor.intercept(mockExecutionContext, mockCallHandler);
      
      result.subscribe({
        error: () => {
          expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('❌ API Error: GET /api/schedules')
          );
          
          expect(mockSentryService.captureMessage).toHaveBeenCalledWith(
            expect.stringContaining('API Error - GET /api/schedules failed after'),
            'error',
            expect.objectContaining({
              service: 'api',
              error_type: 'api_error',
              endpoint: 'GET /api/schedules',
              error_message: 'API Error',
            })
          );
          
          expect(mockSentryService.setTag).toHaveBeenCalledWith('service', 'api');
          expect(mockSentryService.setTag).toHaveBeenCalledWith('error_type', 'api_error');
          expect(mockSentryService.setTag).toHaveBeenCalledWith('endpoint', 'GET /api/schedules');
          done();
        }
      });
    });

    it('handles errors with status codes', (done) => {
      const error = new Error('Not Found');
      (error as any).status = 404;
      mockCallHandler.handle.mockReturnValue(throwError(() => error));
      
      const result = interceptor.intercept(mockExecutionContext, mockCallHandler);
      
      result.subscribe({
        error: () => {
          expect(mockSentryService.captureMessage).toHaveBeenCalledWith(
            expect.any(String),
            'error',
            expect.objectContaining({
              error_status: 404,
            })
          );
          done();
        }
      });
    });

    it('handles errors without status codes', (done) => {
      const error = new Error('Internal Error');
      mockCallHandler.handle.mockReturnValue(throwError(() => error));
      
      const result = interceptor.intercept(mockExecutionContext, mockCallHandler);
      
      result.subscribe({
        error: () => {
          expect(mockSentryService.captureMessage).toHaveBeenCalledWith(
            expect.any(String),
            'error',
            expect.objectContaining({
              error_status: 500,
            })
          );
          done();
        }
      });
    });

    it('handles missing request properties gracefully', () => {
      const mockRequest = {
        method: 'POST',
        url: '/api/test',
        headers: {},
        connection: { remoteAddress: '192.168.1.1' },
      };
      
      const mockHttpContext = {
        getRequest: jest.fn().mockReturnValue(mockRequest),
        getResponse: jest.fn().mockReturnValue({}),
        getNext: jest.fn(),
      };
      
      mockExecutionContext.switchToHttp.mockReturnValue(mockHttpContext);
      
      mockCallHandler.handle.mockReturnValue(of({ data: 'test' }));
      
      interceptor.intercept(mockExecutionContext, mockCallHandler);
      
      expect(mockSentryService.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userAgent: 'unknown',
            ip: '192.168.1.1',
          }),
        })
      );
    });
  });
}); 