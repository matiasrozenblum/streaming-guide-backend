import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import {
  AnalyticsAdminService,
  DEFAULT_METRIC,
} from './analytics-admin.service';
import {
  DateRangeDto,
  TrendQueryDto,
  RankingQueryDto,
  ProgramTrendQueryDto,
  Granularity,
} from '../dto/analytics-query.dto';

@ApiTags('analytics')
@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AnalyticsAdminController {
  constructor(private readonly adminService: AnalyticsAdminService) {}

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
}
