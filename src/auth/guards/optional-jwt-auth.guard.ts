import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any) {
    if (err) throw err;
    // info is an Error instance when a token was present but invalid/expired
    if (!user && info instanceof Error) {
      throw new UnauthorizedException(info.message);
    }
    return user || null;
  }
}
