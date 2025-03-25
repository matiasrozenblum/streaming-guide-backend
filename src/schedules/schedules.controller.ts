import { Controller, Get, Post, Body, Param, Delete } from '@nestjs/common';
import { SchedulesService } from './schedules.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { Schedule } from './schedules.entity';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('schedules')  // Etiqueta para los horarios
@Controller('schedules')
export class SchedulesController {
  constructor(private readonly schedulesService: SchedulesService) {}

  @Get()
  @ApiOperation({ summary: 'Obtener todos los horarios' })
  @ApiResponse({ status: 200, description: 'Lista de horarios', type: [Schedule] })
  findAll(): Promise<Schedule[]> {
    return this.schedulesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un horario por ID' })
  @ApiResponse({ status: 200, description: 'Horario encontrado', type: Schedule })
  findOne(@Param('id') id: string): Promise<Schedule> {
    return this.schedulesService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crear un nuevo horario' })
  @ApiResponse({ status: 201, description: 'Horario creado', type: Schedule })
  create(@Body() createScheduleDto: CreateScheduleDto): Promise<Schedule> {
    return this.schedulesService.create(createScheduleDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un horario por ID' })
  @ApiResponse({ status: 204, description: 'Horario eliminado' })
  remove(@Param('id') id: string): Promise<void> {
    return this.schedulesService.remove(id);
  }
}