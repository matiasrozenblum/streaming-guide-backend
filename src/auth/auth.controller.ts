import {
  Controller,
  Post,
  Body,
  BadRequestException,
  UnauthorizedException,
  Request,
  Res,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly otpService: OtpService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  @Post('login')
  @ApiOperation({ summary: 'Login with email & password' })
  @ApiResponse({ status: 201, description: 'Access token and device ID' })
  async loginUser(
    @Request() req: any,
    @Body() body: { email: string; password: string; deviceId?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const { email, password, deviceId } = body;
    const userAgent = req.headers['user-agent'] || 'Unknown';
    
    try {
      const { access_token, refresh_token } = await this.authService.loginUser(email, password, userAgent, deviceId);
      // Set refresh token as HTTP-only cookie
      res.cookie('refresh_token', refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/'
      });
      return { access_token };
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
    console.log('🔍 [AuthController] verify-code called with:', {
      identifier,
      deviceId,
      userAgent: req.headers['user-agent'],
      timestamp: new Date().toISOString()
    });

    if (!identifier || !code) throw new BadRequestException('Falta identificador o código');
    await this.otpService.verifyCode(identifier, code);

    // Si existe el usuario, lo logueamos
    const user = await this.usersService.findByEmail(identifier);
    if (user) {
      console.log('✅ [AuthController] User found, generating token for user:', user.id);
      // For OTP login, we don't verify password, so we generate token directly
      // Device creation will be handled by frontend useDeviceId hook with correct user-agent
      const access_token = await this.authService.signJwtForIdentifier(identifier);
      console.log('✅ [AuthController] Token generated, device creation delegated to frontend');
      return { access_token, isNew: false };
    }

    console.log('🆕 [AuthController] New user, returning registration token');
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
    if (!dto.gender || !dto.birthDate) {
      throw new BadRequestException('Género y fecha de nacimiento son obligatorios');
    }
    console.log('🔍 [AuthController] register called with:', {
      email: dto.registration_token ? 'hidden' : 'none',
      deviceId: dto.deviceId,
      userAgent: req.headers['user-agent'],
      timestamp: new Date().toISOString()
    });

    const { registration_token, firstName, lastName, password, deviceId, gender, birthDate } = dto;
    // 1) Validamos el token y extraemos el email
    const { email } = await this.authService.verifyRegistrationToken(registration_token);

    // 2) Creamos el usuario (hasheo de password incluido en UsersService)
    const user = await this.usersService.create({ 
      email,
      firstName, 
      lastName, 
      password,
      gender,
      birthDate
    });
    console.log('✅ [AuthController] User created:', user.id);

    // 3) If deviceId is provided, ensure the device is created
    if (deviceId) {
      const userAgent = req.headers['user-agent'] || 'Unknown';
      await this.usersService.ensureUserDevice(user, userAgent, deviceId);
      console.log('✅ [AuthController] Device created/updated for user:', user.id);
    }

    // 4) Generamos el JWT definitivo
    const payload = {
      sub: user.id,
      type: 'public',
      role: user.role,
      gender: user.gender,
      birthDate: user.birthDate,
      name: user.firstName + ' ' + user.lastName,
      email: user.email,
    };
    const access_token = this.jwtService.sign(payload);
    return { access_token };
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token using refresh token cookie' })
  async refreshToken(@Request() req: any, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.refresh_token;
    if (!refreshToken) throw new UnauthorizedException('No refresh token');
    try {
      const payload = await this.authService.verifyRefreshToken(refreshToken);
      // Remove iat, exp from payload
      const { iat, exp, ...rest } = payload;
      const access_token = await this.authService.signAccessToken(rest);
      return { access_token };
    } catch (err) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}