import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async login(password: string, isBackoffice: boolean = false) {
    const correctPassword = isBackoffice
      ? this.configService.get<string>('BACKOFFICE_PASSWORD')
      : this.configService.get<string>('PUBLIC_PASSWORD');

    if (password !== correctPassword) {
      throw new UnauthorizedException('Invalid password');
    }

    const payload = { 
      sub: isBackoffice ? 'backoffice' : 'public',
      type: isBackoffice ? 'backoffice' : 'public',
      exp: Math.floor(Date.now() / 1000) + 86400 // 24h
    };

    const secret = isBackoffice 
      ? this.configService.get<string>('BACKOFFICE_JWT_SECRET')
      : this.configService.get<string>('JWT_SECRET');

    if (!secret) {
      throw new Error('JWT secret not configured');
    }

    return {
      access_token: await this.jwtService.signAsync(payload, { 
        secret,
        algorithm: 'HS256'
      }),
    };
  }
} 