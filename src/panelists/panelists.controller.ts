import { Controller, Get, Post, Body, Param, Delete } from '@nestjs/common';
import { PanelistsService } from './panelists.service';
import { CreatePanelistDto } from './dto/create-panelist.dto';
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
  findOne(@Param('id') id: string): Promise<Panelist> {
    return this.panelistsService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crear un nuevo panelista' })
  @ApiResponse({ status: 201, description: 'Panelista creado', type: Panelist })
  create(@Body() createPanelistDto: CreatePanelistDto): Promise<Panelist> {
    return this.panelistsService.create(createPanelistDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un panelista por ID' })
  @ApiResponse({ status: 204, description: 'Panelista eliminado' })
  remove(@Param('id') id: string): Promise<void> {
    return this.panelistsService.remove(id);
  }
}