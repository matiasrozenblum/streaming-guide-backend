import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any) {
    if (err) throw err;
    if (!user) {
      // Reject only when a token WAS sent but is malformed, expired, or otherwise invalid.
      // When no token is provided, passport-jwt sets info.name = 'Error' (generic) — allow anonymous.
      const isTokenError =
        info?.name === 'JsonWebTokenError' ||
        info?.name === 'TokenExpiredError' ||
        info?.name === 'NotBeforeError';
      if (isTokenError) {
        throw new UnauthorizedException(info.message);
      }
      return null;
    }
    return user;
  }
}
