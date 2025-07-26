import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from './jwt.service';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  async loginUser(
    email: string,
    password: string,
    userAgent?: string,
    deviceId?: string,
  ): Promise<{ access_token: string; refresh_token: string }> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Device creation will be handled by frontend useDeviceId hook with correct user-agent
    const birthDate =
      user.birthDate instanceof Date
        ? user.birthDate.toISOString().split('T')[0]
        : typeof user.birthDate === 'string'
          ? user.birthDate
          : undefined;
    const payload = this.buildPayload(user);
    return {
      access_token: await this.jwtService.signAccessToken(payload),
      refresh_token: await this.jwtService.signRefreshToken(payload),
    };
  }

  buildPayload(user: any) {
    const birthDate =
      user.birthDate instanceof Date
        ? user.birthDate.toISOString().split('T')[0]
        : typeof user.birthDate === 'string'
          ? user.birthDate
          : undefined;
    return {
      sub: user.id,
      type: 'public',
      role: user.role,
      gender: user.gender,
      birthDate,
      name: user.firstName + ' ' + user.lastName,
      email: user.email,
    };
  }

  async signJwtForIdentifier(identifier: string): Promise<string> {
    const user = await this.usersService.findByEmail(identifier);
    if (!user) throw new UnauthorizedException('User not found');
    const birthDate =
      user.birthDate instanceof Date
        ? user.birthDate.toISOString().split('T')[0]
        : typeof user.birthDate === 'string'
          ? user.birthDate
          : undefined;
    const payload = {
      sub: user.id,
      type: 'public',
      role: user.role,
      gender: user.gender,
      birthDate,
      name: user.firstName + ' ' + user.lastName,
      email: user.email,
    };
    return await this.jwtService.sign(payload);
  }

  async signRegistrationToken(identifier: string, additionalData?: Record<string, any>): Promise<string> {
    // firmamos un token que contiene el email, un flag y datos adicionales
    const payload = { email: identifier, type: 'registration', ...additionalData };
    return await this.jwtService.sign(payload, { expiresIn: '1h' });
  }

  async verifyRegistrationToken(token: string): Promise<{ email: string; [key: string]: any }> {
    try {
      const payload: any = await this.jwtService.verify(token);
      if (payload.type !== 'registration' || !payload.email) {
        throw new Error();
      }
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid registration token');
    }
  }

  async verifyRefreshToken(token: string) {
    return await this.jwtService.verifyRefreshToken(token);
  }

  async signAccessToken(payload: Record<string, any>): Promise<string> {
    return this.jwtService.signAccessToken(payload);
  }

  async signRefreshToken(payload: Record<string, any>): Promise<string> {
    return this.jwtService.signRefreshToken(payload);
  }
}