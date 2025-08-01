import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { SentryService } from '../../sentry/sentry.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private readonly sentryService: SentryService,
  ) {
    const secret = configService.get<string>('JWT_SECRET') || 'default_secret_key_for_development';
    
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: any) {
    try {
      if (!payload.type || !payload.sub) {
        // Log JWT validation failure
        this.sentryService.captureMessage('JWT token validation failed - Invalid token payload', 'error', {
          service: 'authentication',
          error_type: 'jwt_validation_failed',
          payload_keys: Object.keys(payload),
          has_type: !!payload.type,
          has_sub: !!payload.sub,
          timestamp: new Date().toISOString(),
        });
        
        this.sentryService.setTag('service', 'authentication');
        this.sentryService.setTag('error_type', 'jwt_validation_failed');
        
        throw new UnauthorizedException('Invalid token payload');
      }
      
      return {
        id: payload.sub,
        role: payload.role,
        type: payload.type,
      };
    } catch (error) {
      // Log any other JWT-related errors
      if (error instanceof UnauthorizedException) {
        throw error; // Re-throw UnauthorizedException
      }
      
      this.sentryService.captureMessage('JWT token validation failed - Unexpected error', 'error', {
        service: 'authentication',
        error_type: 'jwt_validation_failed',
        error_message: error.message,
        timestamp: new Date().toISOString(),
      });
      
      this.sentryService.setTag('service', 'authentication');
      this.sentryService.setTag('error_type', 'jwt_validation_failed');
      
      throw new UnauthorizedException('Invalid token');
    }
  }
} 