import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  private readonly ADMIN_PASSWORD = 'admin123'; // This should be moved to environment variables in production

  constructor(private jwtService: JwtService) {}

  async validatePassword(password: string): Promise<boolean> {
    return password === this.ADMIN_PASSWORD;
  }

  async login(password: string) {
    const isValid = await this.validatePassword(password);
    if (!isValid) {
      throw new Error('Invalid password');
    }

    const payload = { sub: 'admin' };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }
} 