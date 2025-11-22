import { Controller, Get, Post, Body, Param, Delete, Patch, UseGuards } from '@nestjs/common';
import { StreamersService } from './streamers.service';
import { CreateStreamerDto } from './dto/create-streamer.dto';
import { UpdateStreamerDto } from './dto/update-streamer.dto';
import { Streamer } from './streamers.entity';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('streamers')
@Controller('streamers')
export class StreamersController {
  constructor(private readonly streamersService: StreamersService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener todos los streamers' })
  @ApiResponse({ status: 200, description: 'Lista de streamers', type: [Streamer] })
  findAll(): Promise<Streamer[]> {
    return this.streamersService.findAll();
  }

  @Get('visible')
  @ApiOperation({ summary: 'Obtener streamers visibles (público) con estado de live' })
  @ApiResponse({ status: 200, description: 'Lista de streamers visibles con estado de live', type: [Streamer] })
  async findAllVisible(): Promise<Array<Streamer & { is_live?: boolean }>> {
    return this.streamersService.findAllVisibleWithLiveStatus();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener un streamer por ID' })
  @ApiResponse({ status: 200, description: 'Streamer encontrado', type: Streamer })
  findOne(@Param('id') id: number): Promise<Streamer> {
    return this.streamersService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crear un nuevo streamer' })
  @ApiResponse({ status: 201, description: 'Streamer creado', type: Streamer })
  create(@Body() createStreamerDto: CreateStreamerDto): Promise<Streamer> {
    return this.streamersService.create(createStreamerDto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Actualizar un streamer' })
  @ApiResponse({ status: 200, description: 'Streamer actualizado', type: Streamer })
  update(@Param('id') id: number, @Body() updateStreamerDto: UpdateStreamerDto): Promise<Streamer> {
    return this.streamersService.update(id, updateStreamerDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Eliminar un streamer por ID' })
  @ApiResponse({ status: 204, description: 'Streamer eliminado' })
  remove(@Param('id') id: number): Promise<void> {
    return this.streamersService.remove(id);
  }

  @Post(':id/resubscribe-webhooks')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Re-subscribe to webhooks for a streamer (useful for fixing broken subscriptions)' })
  @ApiResponse({ status: 200, description: 'Webhooks re-subscribed successfully' })
  async resubscribeWebhooks(@Param('id') id: number): Promise<{ success: boolean; message: string }> {
    return this.streamersService.resubscribeWebhooks(id);
  }

  @Get(':id/webhook-status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get webhook subscription status for a streamer (checks Twitch/Kick APIs)' })
  @ApiResponse({ status: 200, description: 'Webhook subscription status' })
  async getWebhookStatus(@Param('id') id: number): Promise<any> {
    return this.streamersService.getWebhookStatus(id);
  }
}

