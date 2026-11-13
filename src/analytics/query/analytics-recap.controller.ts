import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AnalyticsRecapService } from './analytics-recap.service';
import { RecapQueryDto, RecapPeriod } from '../dto/analytics-query.dto';

@ApiTags('analytics')
@Controller('analytics/me')
@UseGuards(JwtAuthGuard)
export class AnalyticsRecapController {
  constructor(private readonly recapService: AnalyticsRecapService) {}

  /**
   * The caller's own recap. The user id comes from the JWT and there is no
   * parameter to override it — a recap is personal data, and the only account
   * anyone can read here is their own.
   */
  @Get('recap')
  @ApiOperation({ summary: "The signed-in user's own listening recap" })
  @ApiResponse({ status: 200, description: 'Recap for the requested period' })
  async getRecap(@Req() req, @Query() query: RecapQueryDto) {
    const userId = Number(req.user?.id);
    if (!Number.isFinite(userId)) {
      throw new UnauthorizedException('Invalid user');
    }

    return this.recapService.getRecap(
      userId,
      query.period ?? RecapPeriod.WEEK,
      query.date,
    );
  }
}
