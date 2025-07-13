import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  UseGuards,
  Req,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UsersService } from './users.service';
import { OtpService } from '../auth/otp.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './users.entity';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService, public otpService: OtpService) {}

  /** Registro público */
  @Post()
  @ApiOperation({ summary: 'Registrar nuevo usuario' })
  @ApiResponse({ status: 201, type: User })
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  /** Listar todos (solo admin) */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Get()
  @Roles('admin')
  @ApiOperation({ summary: 'Listar usuarios (solo admin)' })
  @ApiResponse({ status: 200, type: [User] })
  findAll() {
    return this.usersService.findAll();
  }

  /** Perfil propio */
  @ApiBearerAuth()
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Perfil de usuario autenticado' })
  @ApiResponse({ status: 200, type: User })
  getProfile(@Req() req) {
    return this.usersService.findOne(req.user.id);
  }

  /** Obtener usuario por ID (admin o dueño) */
  @UseGuards(JwtAuthGuard, RolesGuard)        // ← agregado aquí
  @ApiBearerAuth()
  @Get(':id')
  @Roles('admin', 'user')                     // ← opcional, aclara roles válidos
  @ApiOperation({ summary: 'Obtener usuario por ID' })
  @ApiResponse({ status: 200, type: User })
  findOne(@Param('id') id: string, @Req() req) {
    const userId = Number(id);
    const requester = req.user;
    if (requester.role !== 'admin' && requester.id !== userId) {
      throw new ForbiddenException('No autorizado');
    }
    return this.usersService.findOne(userId);
  }

  /**
     * Buscar usuario por email
     */
  @Get('email/:email')
  @ApiOperation({ summary: 'Buscar usuario por email' })
  @ApiResponse({ status: 200, type: User })
  async findByEmail(@Param('email') email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new NotFoundException(`Usuario con email ${email} no encontrado`);
    }
    return user;
  }

  /** Upsert user for social login (no password required) */
  @Post('social-upsert')
  @ApiOperation({ summary: 'Upsert user for social login (no password required)' })
  async socialUpsert(@Body() body: { firstName: string; lastName: string; email: string; gender?: string; birthDate?: string }) {
    // Try to find user by email
    let user = await this.usersService.findByEmail(body.email);
    const allowedGenders = ['male', 'female', 'non_binary', 'rather_not_say'];
    if (user) {
      // Prepare update DTO
      const updateDto: any = {
        firstName: body.firstName || user.firstName,
        lastName: body.lastName || user.lastName,
      };
      if (body.gender && allowedGenders.includes(body.gender)) {
        updateDto.gender = body.gender;
      }
      if (body.birthDate) {
        updateDto.birthDate = body.birthDate;
      }
      user = await this.usersService.update(user.id, updateDto);
    } else {
      // Create user without password
      user = await this.usersService.createSocialUser(body);
    }
    return user;
  }

  /** Actualizar (admin o dueño) */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Patch(':id')
  @Roles('admin', 'user')
  @ApiOperation({ summary: 'Actualizar usuario por ID' })
  @ApiResponse({ status: 200, type: User })
  update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @Req() req,
  ) {
    // Remove empty string fields before validation
    Object.keys(updateUserDto).forEach(
      (key) => (updateUserDto[key] === '' ? delete updateUserDto[key] : undefined)
    );
    const userId = Number(id);
    const requester = req.user;
    if (requester.role !== 'admin' && requester.id !== userId) {
      throw new ForbiddenException('No autorizado');
    }
    return this.usersService.update(userId, updateUserDto);
  }

  /** Eliminar (admin o dueño) */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Delete(':id')
  @Roles('admin', 'user')
  @ApiOperation({ summary: 'Eliminar usuario por ID' })
  @ApiResponse({ status: 204, description: 'Cuenta eliminada' })
  remove(@Param('id') id: string, @Req() req) {
    const userId = Number(id);
    const requester = req.user;
    if (requester.role !== 'admin' && requester.id !== userId) {
      throw new ForbiddenException('No autorizado');
    }
    return this.usersService.remove(userId);
  }

  /** Resetear contraseña (olvidada) */
  @Post('reset-password')
  @ApiOperation({ summary: 'Resetear contraseña de usuario (olvidada)' })
  @ApiResponse({ status: 200, description: 'Contraseña reseteada' })
  async resetPassword(@Body() body: { email: string; password: string; code: string }) {
    const { email, password, code } = body;
    // 1. Verificar el código
    await this.otpService.verifyCode(email, code); // Throws if invalid
    // 2. Buscar usuario y actualizar contraseña
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    await this.usersService.update(user.id, { password });
    return { message: 'Password reset successfully' };
  }
}