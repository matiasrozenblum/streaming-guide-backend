import { Controller, Get, Post, Body, Param, Delete, Patch } from '@nestjs/common';
import { ChannelsService } from './channels.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { Channel } from './channels.entity';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('channels')  // Etiqueta para los canales
@Controller('channels')
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Get()
  @ApiOperation({ summary: 'Obtener todos los canales' })  // Descripción de la operación
  @ApiResponse({ status: 200, description: 'Lista de canales', type: [Channel] })  // Respuesta esperada
  findAll(): Promise<Channel[]> {
    return this.channelsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un canal por ID' })
  @ApiResponse({ status: 200, description: 'Canal encontrado', type: Channel })
  findOne(@Param('id') id: string): Promise<Channel> {
    return this.channelsService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crear un nuevo canal' })
  @ApiResponse({ status: 201, description: 'Canal creado', type: Channel })
  create(@Body() createChannelDto: CreateChannelDto): Promise<Channel> {
    return this.channelsService.create(createChannelDto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un canal' })
  @ApiResponse({ status: 200, description: 'Canal actualizado', type: Channel })
  update(@Param('id') id: string, @Body() updateChannelDto: UpdateChannelDto): Promise<Channel> {
    return this.channelsService.update(id, updateChannelDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un canal por ID' })
  @ApiResponse({ status: 204, description: 'Canal eliminado' })
  remove(@Param('id') id: string): Promise<void> {
    return this.channelsService.remove(id);
  }
}