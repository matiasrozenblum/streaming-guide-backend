import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { OptionalJwtAuthGuard } from '../../auth/guards/optional-jwt-auth.guard';
import { AnalyticsIngestService } from './analytics-ingest.service';
import { IngestEventsDto } from '../dto/ingest-events.dto';

@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsIngestController {
  constructor(private readonly ingestService: AnalyticsIngestService) {}

  /**
   * Public by design — anonymous visitors are most of the traffic and their
   * behaviour is exactly what the rankings measure. A token, when present, only
   * adds attribution: it is the sole source of user_id, so a caller can never
   * file events against another account.
   */
  @Post('events')
  @UseGuards(OptionalJwtAuthGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Ingest a batch of behavioural events' })
  @ApiResponse({ status: 202, description: 'Batch accepted for processing' })
  async ingest(@Req() req, @Body() dto: IngestEventsDto) {
    const userId = req.user?.id ? Number(req.user.id) : null;
    const userRole = req.user?.role ?? null;

    return this.ingestService.ingest(
      dto,
      Number.isFinite(userId as number) ? userId : null,
      userRole,
    );
  }
}
