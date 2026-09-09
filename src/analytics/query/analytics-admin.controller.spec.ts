import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { ROLES_KEY } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../auth/guards/optional-jwt-auth.guard';
import { AnalyticsAdminController } from './analytics-admin.controller';
import { AnalyticsRecapController } from './analytics-recap.controller';
import { AnalyticsIngestController } from '../ingest/analytics-ingest.controller';

const GUARDS_KEY = '__guards__';

function guardsOf(target: object): unknown[] {
  return (Reflect.getMetadata(GUARDS_KEY, target) as unknown[]) ?? [];
}

describe('Analytics controller access control', () => {
  describe('AnalyticsAdminController', () => {
    it('requires authentication and role checking', () => {
      expect(guardsOf(AnalyticsAdminController)).toEqual([
        JwtAuthGuard,
        RolesGuard,
      ]);
    });

    it('restricts every route to admins', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, AnalyticsAdminController);
      expect(roles).toEqual(['admin']);
    });

    it('turns a non-admin away at the RolesGuard', () => {
      const reflector = new Reflector();
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue(['admin'] as never);
      const guard = new RolesGuard(reflector);

      const context = {
        getHandler: () => jest.fn(),
        getClass: () => AnalyticsAdminController,
        switchToHttp: () => ({
          getRequest: () => ({ user: { id: 5, role: 'user' } }),
        }),
      } as unknown as ExecutionContext;

      expect(guard.canActivate(context)).toBe(false);
    });

    it('lets an admin through', () => {
      const reflector = new Reflector();
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue(['admin'] as never);
      const guard = new RolesGuard(reflector);

      const context = {
        getHandler: () => jest.fn(),
        getClass: () => AnalyticsAdminController,
        switchToHttp: () => ({
          getRequest: () => ({ user: { id: 1, role: 'admin' } }),
        }),
      } as unknown as ExecutionContext;

      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('rollup endpoint', () => {
    const controller = () =>
      new AnalyticsAdminController(
        {} as never,
        { backfill: jest.fn().mockResolvedValue(3) } as never,
      );

    it('rejects an inverted range', async () => {
      await expect(
        controller().runRollup({ from: '2026-09-10', to: '2026-09-01' }),
      ).rejects.toThrow('from must not be after to');
    });

    it('rejects a range long enough to starve the request path', async () => {
      await expect(
        controller().runRollup({ from: '2024-01-01', to: '2026-09-01' }),
      ).rejects.toThrow(/370/);
    });

    it('accepts a single day', async () => {
      await expect(
        controller().runRollup({ from: '2026-09-01', to: '2026-09-01' }),
      ).resolves.toMatchObject({ days_processed: 3 });
    });

    it('delegates the range to the rollup service', async () => {
      const rollup = { backfill: jest.fn().mockResolvedValue(2) };
      const c = new AnalyticsAdminController({} as never, rollup as never);

      await c.runRollup({ from: '2026-09-01', to: '2026-09-02' });

      expect(rollup.backfill).toHaveBeenCalledWith('2026-09-01', '2026-09-02');
    });
  });

  describe('AnalyticsRecapController', () => {
    it('requires a real session', () => {
      expect(guardsOf(AnalyticsRecapController)).toEqual([JwtAuthGuard]);
    });

    it('is not restricted to admins — every user reads their own recap', () => {
      expect(
        Reflect.getMetadata(ROLES_KEY, AnalyticsRecapController),
      ).toBeUndefined();
    });
  });

  describe('AnalyticsIngestController', () => {
    it('accepts anonymous callers, since most traffic is logged out', () => {
      const routeGuards = guardsOf(
        AnalyticsIngestController.prototype.ingest as unknown as object,
      );
      expect(routeGuards).toEqual([OptionalJwtAuthGuard]);
    });

    it('carries no role restriction', () => {
      expect(
        Reflect.getMetadata(ROLES_KEY, AnalyticsIngestController),
      ).toBeUndefined();
    });
  });
});
