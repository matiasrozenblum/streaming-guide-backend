import {
  Controller,
  Post,
  Body,
  BadRequestException,
  UnauthorizedException,
  Request,
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
  @ApiResponse({ status: 201, description: 'Access token and device ID' })
  async loginUser(
    @Request() req: any,
    @Body() body: { email: string; password: string; deviceId?: string },
  ) {
    const { email, password, deviceId } = body;
    const userAgent = req.headers['user-agent'] || 'Unknown';
    
    try {
      return await this.authService.loginUser(email, password, userAgent, deviceId);
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
  async verifyCode(
    @Request() req: any,
    @Body() { identifier, code, deviceId }: { identifier: string; code: string; deviceId?: string },
  ) {
    if (!identifier || !code) throw new BadRequestException('Falta identificador o código');
    await this.otpService.verifyCode(identifier, code);

    // Si existe el usuario, lo logueamos
    const user = await this.usersService.findByEmail(identifier);
    if (user) {
      const userAgent = req.headers['user-agent'] || 'Unknown';
      // For OTP login, we don't verify password, so we generate token and device directly
      const access_token = await this.authService.signJwtForIdentifier(identifier);
      const finalDeviceId = await this.usersService.ensureUserDevice(user, userAgent, deviceId);
      return { access_token, deviceId: finalDeviceId, isNew: false };
    }

    // Si no existe, devolvemos un token de registro
    const registration_token = this.authService.signRegistrationToken(identifier);
    return { registration_token, isNew: true };
  }

  @Post('register')
  @ApiOperation({ summary: 'Completa el registro y retorna JWT de sesión' })
  async register(
    @Request() req: any,
    @Body() dto: RegisterDto & { deviceId?: string },
  ) {
    const { registration_token, firstName, lastName, password, deviceId } = dto;
    // 1) Validamos el token y extraemos el email
    const { email } = this.authService.verifyRegistrationToken(registration_token);

    // 2) Creamos el usuario (hasheo de password incluido en UsersService)
    const user = await this.usersService.create({ email, firstName, lastName, password });

    // 3) Crear device para el nuevo usuario
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const finalDeviceId = await this.usersService.ensureUserDevice(user, userAgent, deviceId);

    // 4) Generamos el JWT definitivo
    const access_token = this.jwtService.sign({ sub: user.id, type: 'public', role: user.role });
    return { access_token, deviceId: finalDeviceId };
  }
}