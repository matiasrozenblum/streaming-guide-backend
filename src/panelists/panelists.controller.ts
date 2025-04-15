import { Controller, Get, Post, Body, Param, Delete, Patch, NotFoundException } from '@nestjs/common';
import { PanelistsService } from './panelists.service';
import { CreatePanelistDto } from './dto/create-panelist.dto';
import { UpdatePanelistDto } from './dto/update-panelist.dto';
import { Panelist } from './panelists.entity';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Program } from '../programs/programs.entity';

@ApiTags('panelists')  // Etiqueta para los panelistas
@Controller('panelists')
export class PanelistsController {
  constructor(private readonly panelistsService: PanelistsService) {}

  @Get()
  @ApiOperation({ summary: 'Obtener todos los panelistas' })
  @ApiResponse({ status: 200, description: 'Lista de panelistas', type: [Panelist] })
  findAll(): Promise<Panelist[]> {
    return this.panelistsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un panelista por ID' })
  @ApiResponse({ status: 200, description: 'Panelista encontrado', type: Panelist })
  async findOne(@Param('id') id: number): Promise<Panelist> {
    const panelist = await this.panelistsService.findOne(id);
    if (!panelist) {
      throw new NotFoundException(`Panelist with ID ${id} not found`);
    }
    return panelist;
  }

  @Get('program/:programId')
  @ApiOperation({ summary: 'Obtener panelistas por programa' })
  @ApiResponse({ status: 200, description: 'Lista de panelistas del programa', type: [Panelist] })
  findByProgram(@Param('programId') programId: string): Promise<Panelist[]> {
    return this.panelistsService.findByProgram(programId);
  }

  @Get(':id/programs')
  @ApiOperation({ summary: 'Obtener programas de un panelista' })
  @ApiResponse({ status: 200, description: 'Lista de programas del panelista', type: [Program] })
  async getPanelistPrograms(@Param('id') id: number): Promise<Program[]> {
    const panelist = await this.panelistsService.findOne(id);
    if (!panelist) {
      throw new NotFoundException(`Panelist with ID ${id} not found`);
    }
    return panelist.programs || [];
  }

  @Post(':id/programs/:programId')
  @ApiOperation({ summary: 'Agregar panelista a un programa' })
  @ApiResponse({ status: 200, description: 'Panelista agregado al programa' })
  async addToProgram(
    @Param('id') id: number,
    @Param('programId') programId: number,
  ): Promise<void> {
    await this.panelistsService.addToProgram(id, programId);
  }

  @Delete(':id/programs/:programId')
  @ApiOperation({ summary: 'Remover panelista de un programa' })
  @ApiResponse({ status: 200, description: 'Panelista removido del programa' })
  async removeFromProgram(
    @Param('id') id: number,
    @Param('programId') programId: number,
  ): Promise<void> {
    await this.panelistsService.removeFromProgram(id, programId);
  }

  @Post()
  @ApiOperation({ summary: 'Crear un nuevo panelista' })
  @ApiResponse({ status: 201, description: 'Panelista creado', type: Panelist })
  create(@Body() createPanelistDto: CreatePanelistDto): Promise<Panelist> {
    return this.panelistsService.create(createPanelistDto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un panelista' })
  @ApiResponse({ status: 200, description: 'Panelista actualizado', type: Panelist })
  async update(
    @Param('id') id: string,
    @Body() updatePanelistDto: UpdatePanelistDto,
  ): Promise<Panelist> {
    const panelist = await this.panelistsService.update(id, updatePanelistDto);
    if (!panelist) {
      throw new NotFoundException(`Panelist with ID ${id} not found`);
    }
    return panelist;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un panelista por ID' })
  @ApiResponse({ status: 204, description: 'Panelista eliminado' })
  async remove(@Param('id') id: string): Promise<void> {
    const result = await this.panelistsService.remove(id);
    if (!result) {
      throw new NotFoundException(`Panelist with ID ${id} not found`);
    }
  }

  @Post(':id/clear-cache')
  @ApiOperation({ summary: 'Clear cache for a panelist' })
  @ApiResponse({ status: 200, description: 'Cache cleared successfully' })
  async clearCache(@Param('id') id: string): Promise<{ message: string }> {
    await this.panelistsService.clearCache(id);
    return { message: 'Cache cleared successfully' };
  }
}