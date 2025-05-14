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
    UnauthorizedException,
    NotFoundException,
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
  import { AuthService } from '@/auth/auth.service';

  @ApiTags('users')
  @Controller('users')
  export class UsersController {
    constructor(
        private readonly usersService: UsersService,
        private readonly authService: AuthService,
    ) {}
  
    /**
     * Ruta pública para registro.
     */
    @Post()
    @ApiOperation({ summary: 'Registrar nuevo usuario' })
    @ApiResponse({ status: 201, type: User })
    create(@Body() createUserDto: CreateUserDto) {
      return this.usersService.create(createUserDto);
    }
  
    /**
     * Listar todos los usuarios (solo admin)
     */
    @UseGuards(JwtAuthGuard, RolesGuard)
    @ApiBearerAuth()
    @Get()
    @Roles('admin')
    @ApiOperation({ summary: 'Listar usuarios (solo admin)' })
    @ApiResponse({ status: 200, type: [User] })
    findAll() {
      return this.usersService.findAll();
    }
  
    /**
     * Obtener perfil del usuario autenticado
     */
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @Get('me')
    @ApiOperation({ summary: 'Perfil de usuario autenticado' })
    @ApiResponse({ status: 200, type: User })
    getProfile(@Req() req) {
      return this.usersService.findOne(req.user.id);
    }
  
    /**
     * Obtener usuario por ID (admin o dueño)
     */
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @Get(':id')
    @ApiOperation({ summary: 'Obtener usuario por ID' })
    @ApiResponse({ status: 200, type: User })
    findOne(@Param('id') id: string, @Req() req) {
      const userId = +id;
      const requester = req.user;
      if (requester.role !== 'admin' && userId !== requester.id) {
        throw new ForbiddenException('No autorizado');
      }
      return this.usersService.findOne(userId);
    }
    /**
     * Buscar usuario por email (solo admin)
     */
    @UseGuards(JwtAuthGuard, RolesGuard)
    @ApiBearerAuth()
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
  
    /**
     * Actualizar perfil de usuario (admin o dueño)
     */
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @Patch(':id')
    @ApiOperation({ summary: 'Actualizar usuario por ID' })
    @ApiResponse({ status: 200, type: User })
    update(
      @Param('id') id: string,
      @Body() updateUserDto: UpdateUserDto,
      @Req() req,
    ) {
      const userId = +id;
      const requester = req.user;
      if (requester.role !== 'admin' && userId !== requester.id) {
        throw new ForbiddenException('No autorizado');
      }
      return this.usersService.update(userId, updateUserDto);
    }
  
    /**
     * Eliminar cuenta de usuario (admin o dueño)
     */
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @Delete(':id')
    @ApiOperation({ summary: 'Eliminar usuario por ID' })
    @ApiResponse({ status: 204, description: 'Cuenta eliminada' })
    remove(@Param('id') id: string, @Req() req) {
      const userId = +id;
      const requester = req.user;
      if (requester.role !== 'admin' && userId !== requester.id) {
        throw new ForbiddenException('No autorizado');
      }
      return this.usersService.remove(userId);
    }

    @UseGuards(JwtAuthGuard)
    @Post('change-password')
    @ApiOperation({ summary: 'Change own password' })
    @ApiResponse({ status: 200, description: 'Password changed successfully' })
    async changePassword(
        @Req() req,
        @Body() body: { currentPassword: string; newPassword: string },
    ) {
        const userId = req.user.sub;
        const { currentPassword, newPassword } = body;
        try {
        await this.usersService.changePassword(
            Number(userId),
            currentPassword,
            newPassword,
        );
        return { message: 'Password updated successfully' };
        } catch (error) {
        if (error instanceof UnauthorizedException) {
            throw error;
        }
        throw new UnauthorizedException(error.message);
        }
    }
  }