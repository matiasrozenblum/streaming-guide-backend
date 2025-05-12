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

  /**
   * Legacy login for Friends & Family and Backoffice
   */
  async loginLegacy(password: string, isBackoffice: boolean = false) {
    const correctPassword = isBackoffice
      ? this.configService.get<string>('BACKOFFICE_PASSWORD')
      : this.configService.get<string>('PUBLIC_PASSWORD');

    if (password !== correctPassword) {
      throw new UnauthorizedException('Invalid legacy password');
    }

    const payload = {
      sub: isBackoffice ? 'backoffice' : 'public',
      type: isBackoffice ? 'backoffice' : 'public',
    };

    return {
      access_token: this.jwtService.sign(payload),
    };
  }

  /**
   * Conventional login: validate user entity and issue JWT
   */
  async loginUser(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const isMatching = await bcrypt.compare(password, user.password);
    if (!isMatching) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const payload = { sub: user.id, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}