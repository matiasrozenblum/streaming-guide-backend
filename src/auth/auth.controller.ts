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

  @Post('login')
  @ApiOperation({ summary: 'Login with email & password' })
  @ApiResponse({ status: 201, description: 'Access token and refresh token' })
  async loginUser(
    @Request() req: any,
    @Body() body: { email: string; password: string; deviceId?: string },
  ) {
    const { email, password, deviceId } = body;
    const userAgent = req.headers['user-agent'] || 'Unknown';
    
    try {
      const { access_token, refresh_token } = await this.authService.loginUser(email, password, userAgent, deviceId);
      return { access_token, refresh_token };
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
      const payload = this.authService.buildPayload(user);
      const access_token = await this.authService.signAccessToken(payload);
      const refresh_token = await this.authService.signRefreshToken(payload);
      console.log('✅ [AuthController] Token generated, device creation delegated to frontend');
      return { access_token, refresh_token, isNew: false };
    }

    console.log('🆕 [AuthController] New user, returning registration token');
    // Si no existe, devolvemos un token de registro
    const registration_token = await this.authService.signRegistrationToken(identifier);
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
    const payload = this.authService.buildPayload(user);
    const access_token = await this.authService.signAccessToken(payload);
    const refresh_token = await this.authService.signRefreshToken(payload);
    return { access_token, refresh_token };
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  async refreshToken(@Request() req: any) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('No refresh token provided');
    }
    const refreshToken = authHeader.split(' ')[1];
    
    try {
      const payload = await this.authService.verifyRefreshToken(refreshToken);
      const userId = payload.sub;
      const user = await this.usersService.findOne(Number(userId));
      if (!user) throw new UnauthorizedException('User not found');
      const newPayload = this.authService.buildPayload(user);
      const access_token = await this.authService.signAccessToken(newPayload);
      const refresh_token = await this.authService.signRefreshToken(newPayload); // Generate new refresh token
      return { access_token, refresh_token };
    } catch (err) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  @Post('social-login')
  @ApiOperation({ summary: 'Social login: upsert user and return backend JWT/access token' })
  async socialLogin(
    @Body() body: { email: string; firstName?: string; lastName?: string; provider: string; gender?: string; birthDate?: string }
  ) {
    // Upsert user by email
    let user = await this.usersService.findByEmail(body.email);
    const firstName = body.firstName || '';
    const lastName = body.lastName || '';
    if (user) {
      // Update user fields if provided
      const updateDto: any = {
        firstName: firstName || user.firstName,
        lastName: lastName || user.lastName,
      };
      if (body.gender) updateDto.gender = body.gender;
      if (body.birthDate) updateDto.birthDate = body.birthDate;
      user = await this.usersService.update(user.id, updateDto);
    } else {
      user = await this.usersService.createSocialUser({
        email: body.email,
        firstName,
        lastName,
        gender: body.gender,
        birthDate: body.birthDate,
      });
    }
    // Issue backend JWT/access token
    const payload = this.authService.buildPayload(user);
    const access_token = await this.authService.signAccessToken(payload);
    const refresh_token = await this.authService.signRefreshToken(payload);
    return { access_token, refresh_token };
  }
}