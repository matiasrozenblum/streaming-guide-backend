import { Injectable } from '@nestjs/common';
import { JwtService as NestJwtService } from '@nestjs/jwt';

@Injectable()
export class JwtService {
  constructor(private readonly jwtService: NestJwtService) {}

  async sign(payload: Record<string, any>, options?: { expiresIn?: string }) {
    return this.jwtService.sign(payload, {
      expiresIn: options?.expiresIn || '1d',
    });
  }

  async verify(token: string) {
    return this.jwtService.verify(token);
  }

  async signAccessToken(payload: Record<string, any>) {
    return this.jwtService.sign(payload, {
      expiresIn: '7d', // Extended from '15m' to '7d' as temporary fix
    });
  }

  async signRefreshToken(payload: Record<string, any>) {
    return this.jwtService.sign(payload, {
      expiresIn: '14d',
    });
  }

  async verifyRefreshToken(token: string) {
    return this.jwtService.verify(token);
  }
} 