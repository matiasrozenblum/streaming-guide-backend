# Migration from Sentry to BetterStack

This document outlines the migration process from Sentry (error monitoring) + Spike (uptime monitoring) to BetterStack (both services combined).

## Current Status

### ✅ Completed
- [x] BetterStack service created (`src/betterstack/betterstack.service.ts`)
- [x] BetterStack module created (`src/betterstack/betterstack.module.ts`)
- [x] Dual monitoring service created (`src/monitoring/dual-monitoring.service.ts`)
- [x] Monitoring module created (`src/monitoring/monitoring.module.ts`)
- [x] App module updated to include BetterStack
- [x] Health check endpoints added (`/health` and `/health/detailed`)
- [x] Test endpoint for BetterStack (`/test-betterstack`)
- [x] Migration script created (`scripts/migrate-to-betterstack.sh`)
- [x] Setup guide created (`BETTERSTACK_SETUP.md`)

### 🔄 In Progress
- [ ] Environment configuration (BETTERSTACK_DSN)
- [ ] Testing dual monitoring setup
- [ ] Gradual migration of existing services

### ❌ Pending
- [ ] Update existing services to use DualMonitoringService
- [ ] Remove Sentry dependencies
- [ ] Clean up code

## Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Application  │    │ DualMonitoring   │    │   Sentry        │
│   Services     │───▶│ Service          │───▶│   Service       │
│                 │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │ BetterStack      │
                       │ Service          │
                       │                  │
                       └──────────────────┘
```

## Current Implementation

### Dual Monitoring Service
The `DualMonitoringService` acts as a facade that sends all monitoring data to both Sentry and BetterStack:

```typescript
@Injectable()
export class DualMonitoringService {
  constructor(
    private readonly sentryService: SentryService,
    private readonly betterStackService: BetterStackService,
  ) {}

  captureException(error: Error, context?: Record<string, any>) {
    // Send to both services
    this.sentryService.captureException(error, context);
    this.betterStackService.captureException(error, context);
  }
  
  // ... other methods
}
```

### Health Check Endpoints
- **`/health`**: Basic health check (status: ok)
- **`/health/detailed`**: Comprehensive health check including:
  - Database connectivity
  - Redis connectivity
  - YouTube API status
  - System metrics (uptime, memory)

## Migration Phases

### Phase 1: Parallel Monitoring (Current)
- Both Sentry and BetterStack are active
- All errors and performance issues are sent to both services
- Verify BetterStack is working correctly

### Phase 2: Service Migration
- Gradually update services to use `DualMonitoringService` instead of `SentryService`
- Test that both monitoring systems receive the same data
- Ensure no monitoring data is lost

### Phase 3: Sentry Removal
- Once confident in BetterStack setup
- Remove Sentry dependencies and code
- Update all services to use only BetterStack

## Next Steps

### Immediate (Today)
1. **Set up BetterStack account**
   - Go to [BetterStack.com](https://betterstack.com)
   - Sign up for free account
   - Get your DSN from Settings → Data Sources

2. **Configure environment**
   ```bash
   # Add to your .env file
   BETTERSTACK_DSN=https://your-key@your-org.ingest.betterstack.com/your-project
   ```

3. **Test the setup**
   ```bash
   # Start your application
   npm run start:dev
   
   # Test health endpoint
   curl http://localhost:8080/health/detailed
   
   # Test BetterStack
   curl -X POST http://localhost:8080/test-betterstack
   ```

### This Week
1. **Set up BetterStack monitors**
   - Follow the guide in `BETTERSTACK_SETUP.md`
   - Create monitors for critical endpoints
   - Configure Slack/Teams integration

2. **Test dual monitoring**
   - Verify errors appear in both Sentry and BetterStack
   - Test uptime monitoring
   - Ensure notifications work correctly

### Next Week
1. **Gradual service migration**
   - Start with non-critical services
   - Update imports from `SentryService` to `DualMonitoringService`
   - Test each service thoroughly

2. **Performance validation**
   - Monitor response times
   - Ensure no performance degradation
   - Validate error tracking accuracy

## Testing Strategy

### Error Monitoring Test
```bash
# Test various error scenarios
curl -X POST http://localhost:8080/test-error
curl -X POST http://localhost:8080/test-youtube-error
curl -X POST http://localhost:8080/test-database-error
curl -X POST http://localhost:8080/test-jwt-error
curl -X POST http://localhost:8080/test-redis-error
curl -X POST http://localhost:8080/test-migration-error
curl -X POST http://localhost:8080/test-email-error
```

### Uptime Monitoring Test
1. **Create monitors** in BetterStack for:
   - `GET /health` (every 1 minute)
   - `GET /health/detailed` (every 2 minutes)
   - `GET /api/schedules` (every 5 minutes)

2. **Test incident creation**:
   - Temporarily break an endpoint
   - Verify incident is created in BetterStack
   - Verify Slack/Teams notification is received
   - Fix the endpoint and verify incident resolution

## Rollback Plan

If issues arise during migration:

1. **Immediate rollback**: Remove `BETTERSTACK_DSN` from `.env`
2. **Service rollback**: Revert services to use `SentryService` directly
3. **Module rollback**: Remove BetterStack modules from `app.module.ts`

## Monitoring Checklist

### Before Migration
- [ ] Sentry is working correctly
- [ ] All critical errors are being captured
- [ ] Performance monitoring is active
- [ ] Team is notified of incidents

### During Migration
- [ ] Both services are receiving data
- [ ] No duplicate incidents
- [ ] Response times are acceptable
- [ ] Error tracking is accurate

### After Migration
- [ ] BetterStack is working correctly
- [ ] All critical errors are being captured
- [ ] Uptime monitoring is active
- [ ] Team is notified of incidents
- [ ] Sentry can be safely removed

## Support

- **BetterStack Documentation**: [docs.betterstack.com](https://docs.betterstack.com)
- **BetterStack Status**: [status.betterstack.com](https://status.betterstack.com)
- **Migration Issues**: Check this README and the setup guide
- **Code Issues**: Review the implementation in `src/monitoring/`

## Conclusion

This migration consolidates your monitoring stack from two services (Sentry + Spike) to one service (BetterStack) while maintaining full functionality. The parallel monitoring approach ensures no data loss during the transition.

Take your time with each phase, test thoroughly, and only proceed when you're confident in the setup.
