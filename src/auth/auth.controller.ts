import {
  Controller,
  Post,
  Body,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Legacy Friends & Family / Backoffice login
   */
  @Post('login/legacy')
  async loginLegacy(
    @Body() body: { password: string; isBackoffice?: boolean }
  ) {
    const { password, isBackoffice = false } = body;
    return this.authService.loginLegacy(password, isBackoffice);
  }

  /**
   * Conventional email/password login
   */
  @Post('login')
  async loginUser(
    @Body() body: { email: string; password: string }
  ) {
    const { email, password } = body;
    try {
      return await this.authService.loginUser(email, password);
    } catch (err) {
      throw new UnauthorizedException(err.message);
    }
  }
}