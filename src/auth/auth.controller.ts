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
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { JwtService } from '@nestjs/jwt';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly otpService: OtpService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
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
  @ApiOperation({ summary: 'Verifica OTP y retorna JWT o registration_token' })
  async verifyCode(@Body() { identifier, code }: { identifier: string; code: string }) {
    if (!identifier || !code) throw new BadRequestException('Falta identificador o código');
    await this.otpService.verifyCode(identifier, code);

    // Si existe el usuario, lo logueamos
    const user = await this.usersService.findByEmail(identifier);
    if (user) {
      const access_token = await this.authService.signJwtForIdentifier(identifier);
      return { access_token, isNew: false };
    }

    // Si no existe, devolvemos un token de registro
    const registration_token = this.authService.signRegistrationToken(identifier);
    return { registration_token, isNew: true };
  }

  @Post('register')
  @ApiOperation({ summary: 'Completa el registro y retorna JWT de sesión' })
  async register(@Body() dto: RegisterDto) {
    const { registration_token, firstName, lastName, password } = dto;
    // 1) Validamos el token y extraemos el email
    const { email } = this.authService.verifyRegistrationToken(registration_token);

    // 2) Creamos el usuario (hasheo de password incluido en UsersService)
    const user = await this.usersService.create({ email, firstName, lastName, password });

    // 3) Generamos el JWT definitivo
    const access_token = this.jwtService.sign({ sub: user.id, type: 'public', role: user.role });
    return { access_token };
  }
}