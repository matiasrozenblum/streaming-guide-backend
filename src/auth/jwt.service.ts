import { Injectable } from '@nestjs/common';
import { JwtService as NestJwtService } from '@nestjs/jwt';

@Injectable()
export class JwtService {
  constructor(private jwtService: NestJwtService) {}

  async sign(payload: { type: string }) {
    return this.jwtService.sign(payload, {
      expiresIn: '1d',
    });
  }

  async verify(token: string) {
    return this.jwtService.verify(token);
  }
} 