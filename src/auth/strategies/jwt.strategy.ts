import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: (request, rawJwtToken, done) => {
        try {
          // Decode the token to get the type without verifying
          const decoded = JSON.parse(Buffer.from(rawJwtToken.split('.')[1], 'base64').toString());
          const secret = decoded.type === 'backoffice'
            ? configService.get<string>('BACKOFFICE_JWT_SECRET')
            : configService.get<string>('JWT_SECRET');
          done(null, secret);
        } catch (error) {
          done(error, configService.get<string>('JWT_SECRET'));
        }
      },
    });
  }

  async validate(payload: any) {
    if (!payload.type || !payload.exp) {
      throw new UnauthorizedException('Invalid token payload');
    }
    return payload;
  }
} 