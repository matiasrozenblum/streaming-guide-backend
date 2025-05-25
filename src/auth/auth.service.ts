import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private usersService: UsersService,
  ) {}

  async loginLegacy(
    password: string,
    isBackoffice: boolean = false,
  ): Promise<{ access_token: string }> {
    const correct = isBackoffice
      ? this.configService.get<string>('BACKOFFICE_PASSWORD')
      : this.configService.get<string>('PUBLIC_PASSWORD');
    if (password !== correct) {
      throw new UnauthorizedException('Invalid legacy password');
    }
    const payload = { sub: isBackoffice ? 'backoffice' : 'public', type: isBackoffice ? 'backoffice' : 'public', role: isBackoffice ? 'admin' : 'friends&family' };
    return { access_token: this.jwtService.sign(payload) };
  }

  async loginUser(
    email: string,
    password: string,
    userAgent?: string,
    deviceId?: string,
  ): Promise<{ access_token: string; deviceId: string }> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Ensure user has a device for this session
    const finalDeviceId = await this.usersService.ensureUserDevice(
      user,
      userAgent || 'Unknown',
      deviceId,
    );

    const payload = { sub: user.id, type: 'public', role: user.role };
    return { 
      access_token: this.jwtService.sign(payload),
      deviceId: finalDeviceId,
    };
  }

  async signJwtForIdentifier(identifier: string): Promise<string> {
    const user = await this.usersService.findByEmail(identifier);
    if (!user) throw new UnauthorizedException('User not found');
    const payload = { sub: user.id, type: 'public', role: user.role };
    return this.jwtService.sign(payload);
  }

  signRegistrationToken(identifier: string): string {
    // firmamos un token que contiene solo el email y un flag
    return this.jwtService.sign(
      { email: identifier, type: 'registration' },
      { expiresIn: '1h' } // caduca en 1h
    );
  }

  verifyRegistrationToken(token: string): { email: string } {
    try {
      const payload: any = this.jwtService.verify(token);
      if (payload.type !== 'registration' || !payload.email) {
        throw new Error();
      }
      return { email: payload.email };
    } catch {
      throw new UnauthorizedException('Invalid registration token');
    }
  }
}