import { Controller, Get, Post, Body, Query, Res, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBody, ApiParam } from '@nestjs/swagger';
import { Response } from 'express';
import { ComprehensiveReportService } from './comprehensive-report.service';
import { 
  BaseReportDto, 
  ChannelReportDto, 
  PeriodicReportDto, 
  BatchReportDto, 
  AutomaticReportDto,
  ReportPeriod,
  ReportFormat,
  ReportAction,
  ReportType
} from './dto/report.dto';

@ApiTags('comprehensive-reports')
@Controller('statistics/comprehensive-reports')
export class ComprehensiveReportController {
  constructor(
    private readonly comprehensiveReportService: ComprehensiveReportService,
  ) {}

  @Get('channels')
  @ApiOperation({ summary: 'Get all channels for channel-specific reports' })
  @ApiResponse({ status: 200, description: 'List of all channels' })
  async getAllChannels() {
    return this.comprehensiveReportService.getAllChannels();
  }

  @Post('channel/:channelId')
  @ApiOperation({ summary: 'Generate report for a specific channel' })
  @ApiParam({ name: 'channelId', description: 'Channel ID' })
  @ApiBody({ type: ChannelReportDto })
  @ApiResponse({ status: 200, description: 'Channel report generated successfully' })
  async generateChannelReport(
    @Param('channelId') channelId: number,
    @Body() body: ChannelReportDto,
    @Res() res: Response,
  ) {
    try {
      const result = await this.comprehensiveReportService.generateChannelReport(
        channelId,
        body.from,
        body.to,
        body.format,
        body.action,
        body.toEmail,
      );

      if (body.action === ReportAction.DOWNLOAD && result && 'contentType' in result) {
        res.setHeader('Content-Type', result.contentType || 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
        res.send(Buffer.from(result.data as string, 'base64'));
      } else {
        res.json(result);
      }
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  @Post('periodic')
  @ApiOperation({ summary: 'Generate periodic report (weekly, monthly, quarterly, yearly)' })
  @ApiBody({ type: PeriodicReportDto })
  @ApiResponse({ status: 200, description: 'Periodic report generated successfully' })
  async generatePeriodicReport(
    @Body() body: PeriodicReportDto,
    @Res() res: Response,
  ) {
    try {
      const result = await this.comprehensiveReportService.generatePeriodicReport(
        body.period,
        body.from,
        body.to,
        body.channelId,
        body.format,
        body.action,
      );

      if (body.action === ReportAction.DOWNLOAD && result && 'contentType' in result) {
        res.setHeader('Content-Type', result.contentType || 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
        res.send(Buffer.from(result.data as string, 'base64'));
      } else {
        res.json(result);
      }
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  @Post('batch')
  @ApiOperation({ summary: 'Generate multiple reports in batch' })
  @ApiBody({ type: BatchReportDto })
  @ApiResponse({ status: 200, description: 'Batch reports generated successfully' })
  async generateBatchReports(
    @Body() body: BatchReportDto,
    @Res() res: Response,
  ) {
    try {
      const results: any[] = [];
      for (const report of body.reports) {
        if (report.channelId) {
          const result = await this.comprehensiveReportService.generateChannelReport(
            report.channelId,
            report.from,
            report.to,
            report.format,
            report.action,
            report.toEmail,
          );
          if (result) results.push(result);
        } else {
          const result = await this.comprehensiveReportService.generatePeriodicReport(
            ReportPeriod.CUSTOM,
            report.from,
            report.to,
            report.channelId,
            report.format,
            report.action,
          );
          if (result) results.push(result);
        }
      }
      res.json({ success: true, results });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  @Post('manual/weekly')
  @ApiOperation({ summary: 'Manually generate weekly report' })
  @ApiQuery({ name: 'channelId', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Weekly report generated successfully' })
  async generateManualWeeklyReport(
    @Query('channelId') channelId?: number,
  ) {
    return this.comprehensiveReportService.generatePeriodicReport(
      ReportPeriod.WEEKLY,
      undefined,
      undefined,
      channelId,
    );
  }

  @Post('manual/monthly')
  @ApiOperation({ summary: 'Manually generate monthly report' })
  @ApiQuery({ name: 'channelId', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Monthly report generated successfully' })
  async generateManualMonthlyReport(
    @Query('channelId') channelId?: number,
  ) {
    return this.comprehensiveReportService.generatePeriodicReport(
      ReportPeriod.MONTHLY,
      undefined,
      undefined,
      channelId,
    );
  }

  @Post('manual/quarterly')
  @ApiOperation({ summary: 'Manually generate quarterly report' })
  @ApiQuery({ name: 'channelId', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Quarterly report generated successfully' })
  async generateManualQuarterlyReport(
    @Query('channelId') channelId?: number,
  ) {
    return this.comprehensiveReportService.generatePeriodicReport(
      ReportPeriod.QUARTERLY,
      undefined,
      undefined,
      channelId,
    );
  }

  @Post('manual/yearly')
  @ApiOperation({ summary: 'Manually generate yearly report' })
  @ApiQuery({ name: 'channelId', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Yearly report generated successfully' })
  async generateManualYearlyReport(
    @Query('channelId') channelId?: number,
  ) {
    return this.comprehensiveReportService.generatePeriodicReport(
      ReportPeriod.YEARLY,
      undefined,
      undefined,
      channelId,
    );
  }

  @Get('channel/:channelId/table')
  @ApiOperation({ summary: 'Get channel data for table display' })
  @ApiParam({ name: 'channelId', description: 'Channel ID' })
  @ApiQuery({ name: 'from', required: true, type: String })
  @ApiQuery({ name: 'to', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Channel data for table' })
  async getChannelDataTable(
    @Param('channelId') channelId: number,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.comprehensiveReportService.generateChannelReport(
      channelId,
      from,
      to,
      ReportFormat.CSV,
      ReportAction.TABLE,
    );
  }
} 