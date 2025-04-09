import { Controller, Get, Post, Body, Param, Delete, Put, NotFoundException } from '@nestjs/common';
import { PanelistsService } from './panelists.service';
import { CreatePanelistDto } from './dto/create-panelist.dto';
import { UpdatePanelistDto } from './dto/update-panelist.dto';
import { Panelist } from './panelists.entity';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

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
  async findOne(@Param('id') id: string): Promise<Panelist> {
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

  @Post()
  @ApiOperation({ summary: 'Crear un nuevo panelista' })
  @ApiResponse({ status: 201, description: 'Panelista creado', type: Panelist })
  create(@Body() createPanelistDto: CreatePanelistDto): Promise<Panelist> {
    return this.panelistsService.create(createPanelistDto);
  }

  @Put(':id')
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
}