import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';

/**
 * Regression tests for the 2026-08-23 incident: the schedule grid went blank for
 * signed-in users. This guard rejected expired tokens with a 401, so once a
 * user's access token expired the public endpoints behind it returned no data at
 * all — while anonymous visitors loaded them fine.
 */
describe('OptionalJwtAuthGuard', () => {
  let guard: OptionalJwtAuthGuard;

  beforeEach(() => {
    guard = new OptionalJwtAuthGuard();
    jest.spyOn((guard as any).logger, 'debug').mockImplementation();
  });

  it('returns the user when the token is valid', () => {
    const user = { id: 1, type: 'public' };
    expect(guard.handleRequest(null, user, undefined)).toBe(user);
  });

  it('continues anonymously when no token was sent', () => {
    expect(guard.handleRequest(null, false, { name: 'Error' })).toBeNull();
  });

  it.each([
    ['TokenExpiredError', 'jwt expired'],
    ['JsonWebTokenError', 'invalid signature'],
    ['NotBeforeError', 'jwt not active'],
  ])('continues anonymously on %s instead of rejecting', (name, message) => {
    expect(guard.handleRequest(null, false, { name, message })).toBeNull();
  });

  it('still propagates a genuine strategy error', () => {
    const err = new Error('passport blew up');
    expect(() => guard.handleRequest(err, false, undefined)).toThrow(err);
  });
});
