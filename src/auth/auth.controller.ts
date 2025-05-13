import {
  Controller,
  Post,
  Body,
  BadRequestException,
  UnauthorizedException,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly otpService: OtpService,
  ) {}

  @Post('login/legacy')
  @ApiOperation({ summary: 'Legacy F&F / Backoffice login' })
  @ApiResponse({ status: 201, description: 'Access token' })
  async loginLegacy(
    @Body() body: { password: string; isBackoffice?: boolean },
  ) {
    const { password, isBackoffice = false } = body;
    return this.authService.loginLegacy(password, isBackoffice);
  }

  @Post('login')
  @ApiOperation({ summary: 'Login with email & password' })
  @ApiResponse({ status: 201, description: 'Access token' })
  async loginUser(@Body() body: { email: string; password: string }) {
    const { email, password } = body;
    try {
      return await this.authService.loginUser(email, password);
    } catch (err) {
      throw new UnauthorizedException(err.message);
    }
  }

  @Post('send-code')
  @ApiOperation({ summary: 'Envía un OTP a email/teléfono' })
  @ApiResponse({ status: 200, description: 'Código enviado' })
  async sendCode(@Body() body: { identifier: string }) {
    const { identifier } = body;
    if (!identifier) {
      throw new BadRequestException('Falta identificador');
    }
    await this.otpService.sendCode(identifier);
    return { message: 'Código enviado correctamente' };
  }

  @Post('verify-code')
  @ApiOperation({ summary: 'Verifica OTP y retorna JWT' })
  @ApiResponse({ status: 200, description: 'Access token' })
  async verifyCode(@Body() body: { identifier: string; code: string }) {
    const { identifier, code } = body;
    if (!identifier || !code) {
      throw new BadRequestException('Falta identificador o código');
    }
    await this.otpService.verifyCode(identifier, code);
    const token = await this.authService.signJwtForIdentifier(identifier);
    return { access_token: token };
  }
}