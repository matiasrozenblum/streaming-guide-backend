import { Controller, Get, Post, Body, Param, Delete } from '@nestjs/common';
import { ProgramsService } from './programs.service';
import { CreateProgramDto } from './dto/create-program.dto';
import { Program } from './programs.entity';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('programs')  // Etiqueta para los programas
@Controller('programs')
export class ProgramsController {
  constructor(private readonly programsService: ProgramsService) {}

  @Get()
  @ApiOperation({ summary: 'Obtener todos los programas' })
  @ApiResponse({ status: 200, description: 'Lista de programas', type: [Program] })
  findAll(): Promise<Program[]> {
    return this.programsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un programa por ID' })
  @ApiResponse({ status: 200, description: 'Programa encontrado', type: Program })
  findOne(@Param('id') id: string): Promise<Program> {
    return this.programsService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crear un nuevo programa' })
  @ApiResponse({ status: 201, description: 'Programa creado', type: Program })
  create(@Body() createProgramDto: CreateProgramDto): Promise<Program> {
    return this.programsService.create(createProgramDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un programa por ID' })
  @ApiResponse({ status: 204, description: 'Programa eliminado' })
  remove(@Param('id') id: string): Promise<void> {
    return this.programsService.remove(id);
  }
}