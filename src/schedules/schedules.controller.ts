import { Controller, Get, Post, Body, Param, Delete, Put, NotFoundException, Query, UseGuards } from '@nestjs/common';
import { SchedulesService } from './schedules.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { Schedule } from './schedules.entity';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('schedules')  // Etiqueta para los horarios
@Controller('schedules')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SchedulesController {
  constructor(private readonly schedulesService: SchedulesService) {}

  @Get()
  @ApiOperation({ summary: 'Obtener todos los horarios o filtrar por día' })
  @ApiQuery({ name: 'day', required: false, description: 'Día de la semana para filtrar (ej: monday, tuesday, etc.)' })
  @ApiQuery({
    name: 'deviceId',
    required: false,
    description:
      'ID de dispositivo para incluir flag `subscribed` en cada bloque',
  })
  @ApiQuery({
    name: 'raw',
    required: false,
    description: 'Si es true, devuelve los horarios sin aplicar weekly overrides',
  })
  @ApiResponse({ status: 200, description: 'Lista de horarios', type: [Schedule] })
  async findAll(
    @Query('day') day?: string, 
    @Query('live_status') liveStatus?: string,
    @Query('deviceId') deviceId?: string,
    @Query('raw') raw?: string,
  ): Promise<Schedule[]> {
    const skipCache = liveStatus === 'true';
    const applyOverrides = raw !== 'true';
    return this.schedulesService.findAll({
      dayOfWeek: day?.toLowerCase(),
      skipCache,
      deviceId,
      applyOverrides,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un horario por ID' })
  @ApiResponse({ status: 200, description: 'Horario encontrado', type: Schedule })
  async findOne(@Param('id') id: string): Promise<Schedule> {
    const schedule = await this.schedulesService.findOne(id);
    if (!schedule) {
      throw new NotFoundException(`Schedule with ID ${id} not found`);
    }
    return schedule;
  }

  @Get('program/:programId')
  @ApiOperation({ summary: 'Obtener horarios por programa' })
  @ApiResponse({ status: 200, description: 'Lista de horarios del programa', type: [Schedule] })
  findByProgram(@Param('programId') programId: string): Promise<Schedule[]> {
    return this.schedulesService.findByProgram(programId);
  }

  @Get('day/:dayOfWeek')
  @ApiOperation({ summary: 'Obtener horarios por día de la semana' })
  @ApiResponse({ status: 200, description: 'Lista de horarios del día', type: [Schedule] })
  findByDay(@Param('dayOfWeek') dayOfWeek: string): Promise<Schedule[]> {
    return this.schedulesService.findByDay(dayOfWeek);
  }

  @Post()
  @ApiOperation({ summary: 'Crear un nuevo horario' })
  @ApiResponse({ status: 201, description: 'Horario creado', type: Schedule })
  create(@Body() createScheduleDto: CreateScheduleDto): Promise<Schedule> {
    return this.schedulesService.create(createScheduleDto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar un horario' })
  @ApiResponse({ status: 200, description: 'Horario actualizado', type: Schedule })
  async update(
    @Param('id') id: string,
    @Body() updateScheduleDto: UpdateScheduleDto,
  ): Promise<Schedule> {
    const schedule = await this.schedulesService.update(id, updateScheduleDto);
    if (!schedule) {
      throw new NotFoundException(`Schedule with ID ${id} not found`);
    }
    return schedule;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un horario por ID' })
  @ApiResponse({ status: 204, description: 'Horario eliminado' })
  async remove(@Param('id') id: string): Promise<boolean> {
    const result = await this.schedulesService.remove(id);
    if (!result) {
      throw new NotFoundException(`Schedule with ID ${id} not found`);
    }
    return result;
  }
}