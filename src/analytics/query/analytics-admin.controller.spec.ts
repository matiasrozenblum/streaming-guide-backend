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
