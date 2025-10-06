import { Controller, Get, Post, Body, Param, Delete, Patch, UseGuards, Query } from '@nestjs/common';
import { ChannelsService } from './channels.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { Channel } from './channels.entity';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('channels')  // Etiqueta para los canales
@Controller('channels')
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener todos los canales' })  // Descripción de la operación
  @ApiResponse({ status: 200, description: 'Lista de canales', type: [Channel] })  // Respuesta esperada
  findAll(): Promise<Channel[]> {
    return this.channelsService.findAll();
  }

  @Get('with-schedules')
  async getChannelsWithSchedules(
    @Query('day') day?: string,
    @Query('deviceId') deviceId?: string,
    @Query('live_status') liveStatus?: string,
    @Query('raw') raw?: string
  ) {
    const liveStatusBool = liveStatus === 'true' ? true : liveStatus === 'false' ? false : undefined;
    return this.channelsService.getChannelsWithSchedules(day, deviceId, liveStatusBool, raw);
  }

  @Get('with-schedules/today')
  @ApiOperation({ summary: 'Get today\'s schedules only (optimized for initial load)' })
  @ApiResponse({ status: 200, description: 'Today\'s schedules for all channels' })
  async getTodaySchedules(
    @Query('deviceId') deviceId?: string,
    @Query('live_status') liveStatus?: string,
    @Query('raw') raw?: string
  ) {
    const liveStatusBool = liveStatus === 'true' ? true : liveStatus === 'false' ? false : undefined;
    return this.channelsService.getTodaySchedules(deviceId, liveStatusBool, raw);
  }

  @Get('with-schedules/week')
  @ApiOperation({ summary: 'Get full week schedules (optimized for background loading)' })
  @ApiResponse({ status: 200, description: 'Full week schedules for all channels' })
  async getWeekSchedules(
    @Query('deviceId') deviceId?: string,
    @Query('live_status') liveStatus?: string,
    @Query('raw') raw?: string
  ) {
    const liveStatusBool = liveStatus === 'true' ? true : liveStatus === 'false' ? false : undefined;
    return this.channelsService.getWeekSchedules(deviceId, liveStatusBool, raw);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener un canal por ID' })
  @ApiResponse({ status: 200, description: 'Canal encontrado', type: Channel })
  findOne(@Param('id') id: number): Promise<Channel> {
    return this.channelsService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crear un nuevo canal' })
  @ApiResponse({ status: 201, description: 'Canal creado', type: Channel })
  create(@Body() createChannelDto: CreateChannelDto): Promise<Channel> {
    return this.channelsService.create(createChannelDto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Actualizar un canal' })
  @ApiResponse({ status: 200, description: 'Canal actualizado', type: Channel })
  update(@Param('id') id: number, @Body() updateChannelDto: UpdateChannelDto): Promise<Channel> {
    return this.channelsService.update(id, updateChannelDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Eliminar un canal por ID' })
  @ApiResponse({ status: 204, description: 'Canal eliminado' })
  remove(@Param('id') id: number): Promise<void> {
    return this.channelsService.remove(id);
  }

  @Post('reorder')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async reorder(@Body() body: { ids: number[] }) {
    await this.channelsService.reorder(body.ids);
    return { message: 'Channels reordered successfully' };
  }
}