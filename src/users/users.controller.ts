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
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './users.entity';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

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
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('me')
  @Roles('user', 'admin')
  @UseGuards(RolesGuard)
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

  /** Buscar por email (solo admin) */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Get('email/:email')
  @Roles('admin')
  @ApiOperation({ summary: 'Buscar usuario por email' })
  @ApiResponse({ status: 200, type: User })
  async findByEmail(@Param('email') email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new NotFoundException(`Usuario con email ${email} no encontrado`);
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

  /** Cambiar contraseña */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('change-password')
  @ApiOperation({ summary: 'Cambiar contraseña de usuario' })
  @ApiResponse({ status: 200, description: 'Contraseña actualizada' })
  async changePassword(@Req() req, @Body() body: { currentPassword: string; newPassword: string }) {
    try {
      await this.usersService.changePassword(req.user.sub, body.currentPassword, body.newPassword);
      return { message: 'Password updated successfully' };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid credentials');
    }
  }
}