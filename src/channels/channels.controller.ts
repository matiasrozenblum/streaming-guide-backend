import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Patch,
  UseGuards,
  Query,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Headers,
  Req,
} from '@nestjs/common';
import { needsMidnightSplit } from '../utils/app-version.util';
import { splitCrossMidnightSchedules } from '../utils/midnight-split.util';
import { FileInterceptor } from '@nestjs/platform-express';
import { ChannelsService } from './channels.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { Channel } from './channels.entity';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SupabaseStorageService } from '../banners/supabase-storage.service';
import { YoutubeLiveService } from '../youtube/youtube-live.service';

@ApiTags('channels') // Etiqueta para los canales
@Controller('channels')
export class ChannelsController {
  constructor(
    private readonly channelsService: ChannelsService,
    private readonly supabaseStorageService: SupabaseStorageService,
    private readonly youtubeLiveService: YoutubeLiveService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener todos los canales' }) // Descripción de la operación
  @ApiResponse({
    status: 200,
    description: 'Lista de canales',
    type: [Channel],
  }) // Respuesta esperada
  findAll(): Promise<Channel[]> {
    return this.channelsService.findAll();
  }

  @Get('with-schedules')
  @UseGuards(OptionalJwtAuthGuard)
  async getChannelsWithSchedules(
    @Req() req: any,
    @Query('day') day?: string,
    @Query('deviceId') deviceId?: string,
    @Query('live_status') liveStatus?: string,
    @Query('raw') raw?: string,
    @Headers('x-app-version') appVersion?: string,
    @Headers('origin') origin?: string,
  ) {
    const userId = req.user ? Number(req.user.id) : undefined;
    const liveStatusBool =
      liveStatus === 'true' ? true : liveStatus === 'false' ? false : undefined;
    const result = await this.channelsService.getChannelsWithSchedules(
      day,
      userId,
      liveStatusBool,
      raw,
      undefined,
      userId ? undefined : deviceId,
    );
    if (needsMidnightSplit(appVersion, origin)) {
      return splitCrossMidnightSchedules(result);
    }
    return result;
  }

  @Get('with-schedules/today')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: "Get today's schedules only (optimized for initial load)",
  })
  @ApiResponse({
    status: 200,
    description: "Today's schedules for all channels",
  })
  async getTodaySchedules(
    @Req() req: any,
    @Query('deviceId') deviceId?: string,
    @Query('live_status') liveStatus?: string,
    @Query('raw') raw?: string,
    @Headers('x-app-version') appVersion?: string,
    @Headers('origin') origin?: string,
  ) {
    const userId = req.user ? Number(req.user.id) : undefined;
    const liveStatusBool =
      liveStatus === 'true' ? true : liveStatus === 'false' ? false : undefined;
    const result = await this.channelsService.getTodaySchedules(
      userId,
      liveStatusBool,
      raw,
      userId ? undefined : deviceId,
    );
    if (needsMidnightSplit(appVersion, origin)) {
      return splitCrossMidnightSchedules(result);
    }
    return result;
  }

  @Get('with-schedules/today/v2')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: "V2: Get today's schedules with batched Redis reads (fast)",
  })
  @ApiResponse({
    status: 200,
    description: "Today's schedules with optimized live status",
  })
  async getTodaySchedulesV2(
    @Req() req: any,
    @Query('deviceId') deviceId?: string,
    @Query('live_status') liveStatus?: string,
    @Query('raw') raw?: string,
    @Headers('x-app-version') appVersion?: string,
    @Headers('origin') origin?: string,
  ) {
    const userId = req.user ? Number(req.user.id) : undefined;
    const liveStatusBool =
      liveStatus === 'true' ? true : liveStatus === 'false' ? false : undefined;
    const result = await this.channelsService.getTodaySchedulesV2(
      userId,
      liveStatusBool,
      raw,
      userId ? undefined : deviceId,
    );
    if (needsMidnightSplit(appVersion, origin)) {
      return splitCrossMidnightSchedules(result);
    }
    return result;
  }

  @Get('with-schedules/week')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Get full week schedules (optimized for background loading)',
  })
  @ApiResponse({
    status: 200,
    description: 'Full week schedules for all channels',
  })
  async getWeekSchedules(
    @Req() req: any,
    @Query('deviceId') deviceId?: string,
    @Query('live_status') liveStatus?: string,
    @Query('raw') raw?: string,
    @Query('weekStart') weekStart?: string,
    @Headers('x-app-version') appVersion?: string,
    @Headers('origin') origin?: string,
  ) {
    const userId = req.user ? Number(req.user.id) : undefined;
    const liveStatusBool =
      liveStatus === 'true' ? true : liveStatus === 'false' ? false : undefined;
    const result = await this.channelsService.getWeekSchedules(
      userId,
      liveStatusBool,
      raw,
      weekStart,
      userId ? undefined : deviceId,
    );
    if (needsMidnightSplit(appVersion, origin)) {
      return splitCrossMidnightSchedules(result);
    }
    return result;
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener un canal por ID' })
  @ApiResponse({ status: 200, description: 'Canal encontrado', type: Channel })
  findOne(@Param('id') id: number): Promise<Channel> {
    return this.channelsService.findOne(id);
  }

  @Post('upload')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Upload channel logo',
    description:
      'Uploads an image file to Supabase Storage (channel-logos bucket) and returns the public URL (admin only)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Image uploaded successfully',
    schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Public URL of the uploaded image',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request (invalid file type or size)',
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async uploadLogo(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ url: string }> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    const url = await this.supabaseStorageService.uploadImage(
      file,
      'channel-logos',
    );
    return { url };
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
  update(
    @Param('id') id: number,
    @Body() updateChannelDto: UpdateChannelDto,
  ): Promise<Channel> {
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

  @Post(':id/clear-cache')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Clear cache entries for a channel' })
  @ApiResponse({ status: 200, description: 'Cache cleared successfully' })
  async clearCache(@Param('id') id: number) {
    const channel = await this.channelsService.findOne(id);
    if (!channel.handle) {
      throw new Error('Channel does not have a handle');
    }
    const result = await this.channelsService.clearChannelCache(channel.handle);
    return { message: 'Cache cleared successfully', ...result };
  }

  @Post(':id/fetch-premiere')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Trigger premiere fallback fetch for all currently on-air programs of this channel',
    description:
      'Bypasses is_premiere flag — intended for manual use from the backoffice when a channel is broadcasting a premiere (estreno). Clears not-found flags and checks recent uploads via playlistItems.',
  })
  @ApiResponse({
    status: 200,
    description: 'Results per on-air program',
    schema: {
      type: 'object',
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              programName: { type: 'string' },
              videoId: { type: 'string', nullable: true },
              found: { type: 'boolean' },
            },
          },
        },
      },
    },
  })
  async fetchPremiere(@Param('id') id: number) {
    const channel = await this.channelsService.findOne(id);
    if (!channel.youtube_channel_id || !channel.handle) {
      throw new BadRequestException(
        'Channel does not have a YouTube channel ID or handle',
      );
    }
    const results = await this.youtubeLiveService.fetchPremiereForChannel(
      channel.youtube_channel_id,
      channel.handle,
    );
    return { results };
  }
}
