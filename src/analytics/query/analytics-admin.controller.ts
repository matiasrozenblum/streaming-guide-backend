import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  UseGuards,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import {
  AnalyticsAdminService,
  DEFAULT_METRIC,
} from './analytics-admin.service';
import { AnalyticsRollupService } from '../rollup/analytics-rollup.service';
import {
  DateRangeDto,
  TrendQueryDto,
  RankingQueryDto,
  ProgramTrendQueryDto,
  RollupRangeDto,
  Granularity,
} from '../dto/analytics-query.dto';

@ApiTags('analytics')
@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AnalyticsAdminController {
  constructor(
    private readonly adminService: AnalyticsAdminService,
    private readonly rollupService: AnalyticsRollupService,
  ) {}

  @Get('overview')
  @ApiOperation({
    summary: 'Headline metrics for a range, vs the prior window',
  })
  @ApiResponse({ status: 200, description: 'Overview tiles' })
  async getOverview(@Query() query: DateRangeDto) {
    return this.adminService.getOverview(query.from, query.to, query.platform);
  }

  @Get('trends')
  @ApiOperation({ summary: 'Time series for one metric' })
  async getTrends(@Query() query: TrendQueryDto) {
    return this.adminService.getTrends(
      query.from,
      query.to,
      query.metric ?? DEFAULT_METRIC,
      query.granularity ?? Granularity.DAY,
      query.platform,
    );
  }

  @Get('rankings/programs')
  @ApiOperation({ summary: 'Top programs, with channel branding and movement' })
  async getProgramRanking(@Query() query: RankingQueryDto) {
    return this.adminService.getProgramRanking(
      query.from,
      query.to,
      query.metric ?? DEFAULT_METRIC,
      query.limit ?? 10,
      query.platform,
    );
  }

  @Get('rankings/channels')
  @ApiOperation({ summary: 'Top channels, with branding and movement' })
  async getChannelRanking(@Query() query: RankingQueryDto) {
    return this.adminService.getChannelRanking(
      query.from,
      query.to,
      query.metric ?? DEFAULT_METRIC,
      query.limit ?? 10,
    );
  }

  @Get('programs/:id/trend')
  @ApiOperation({ summary: 'Time series for a single program' })
  async getProgramTrend(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ProgramTrendQueryDto,
  ) {
    return this.adminService.getProgramTrend(
      id,
      query.from,
      query.to,
      query.metric ?? DEFAULT_METRIC,
      query.granularity ?? Granularity.DAY,
    );
  }

  @Get('event-names')
  @ApiOperation({ summary: 'Event names that have recorded data' })
  async getEventNames() {
    return this.adminService.getEventNames();
  }

  /**
   * Recompute the daily rollups for a date range, on demand.
   *
   * The nightly cron covers normal operation, but three cases need this:
   * seeding history after a bulk import, re-deriving everything when the
   * aggregation logic changes, and checking on a fresh environment without
   * waiting until 03:15. Safe to call repeatedly — each day is a full
   * recompute with an UPSERT, never an increment.
   */
  @Post('rollup')
  @ApiOperation({ summary: 'Recompute daily rollups for a date range' })
  async runRollup(@Body() body: RollupRangeDto) {
    const from = new Date(`${body.from}T00:00:00Z`);
    const to = new Date(`${body.to}T00:00:00Z`);

    if (from > to) {
      throw new BadRequestException('from must not be after to');
    }

    // Each day is several full-table aggregations; an unbounded range would
    // hold a connection for as long as it takes and starve the request path.
    const days =
      Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    if (days > 370) {
      throw new BadRequestException('El rango no puede superar los 370 dias');
    }

    const processed = await this.rollupService.backfill(body.from, body.to);
    return { from: body.from, to: body.to, days_processed: processed };
  }
}
