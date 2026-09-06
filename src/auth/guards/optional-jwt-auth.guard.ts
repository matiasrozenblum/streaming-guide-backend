import { Injectable, ExecutionContext, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Authenticates when possible, and falls back to anonymous when not.
 *
 * Used on endpoints that are public but richer for a signed-in caller — the
 * schedule grid, for instance, is identical for everyone except the `subscribed`
 * flag on each program.
 *
 * This guard used to reject an expired or malformed token with a 401. That made
 * a signed-in user strictly worse off than an anonymous one: once their access
 * token expired, the grid returned 401 and the app was left with no data at all,
 * while a logged-out visitor loaded it fine. Degrading to anonymous keeps the
 * public part of the response working and costs only the personalised fields.
 *
 * Endpoints that genuinely require a user still use JwtAuthGuard, which rejects.
 * Clients continue to learn that their token is stale from those (GET /users/me
 * runs on every cold start), so token refresh is still triggered normally.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(OptionalJwtAuthGuard.name);

  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any) {
    if (err) throw err;

    if (!user) {
      // A token was sent but could not be used. Log it — a sudden rise in
      // expired tokens is worth noticing — and continue anonymously.
      const isTokenError =
        info?.name === 'JsonWebTokenError' ||
        info?.name === 'TokenExpiredError' ||
        info?.name === 'NotBeforeError';
      if (isTokenError) {
        this.logger.debug(
          `Continuing anonymously: ${info.name} (${info.message})`,
        );
      }
      return null;
    }

    return user;
  }
}
