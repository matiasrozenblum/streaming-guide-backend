import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { WeeklyReportService } from './weekly-report.service';
import { generateWeeklyReportPdf } from './weekly-report-pdf.util';
import { renderChart, barChartConfig, pieChartConfig } from './chart.util';
import * as dayjs from 'dayjs';

@Controller('statistics/reports')
export class WeeklyReportController {
  constructor(private readonly weeklyReportService: WeeklyReportService) {}

  @Get('weekly-summary/download')
  async downloadWeeklyReport(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('channelId') channelId: string,
    @Res() res: Response,
  ) {
    // 1. Aggregate data
    const data = await this.weeklyReportService.getWeeklyReportData(from, to, channelId ? Number(channelId) : undefined);

    // 2. Generate charts as base64 PNGs
    const charts: Record<string, string> = {};
    // Users by gender
    const usersByGenderChart = await renderChart(pieChartConfig({
      labels: Object.keys(data.usersByGender),
      data: Object.values(data.usersByGender),
      title: 'Usuarios nuevos por género',
    }));
    charts.usersByGender = usersByGenderChart.toString('base64');
    // Subs by gender
    const subsByGenderChart = await renderChart(pieChartConfig({
      labels: Object.keys(data.subscriptionsByGender),
      data: Object.values(data.subscriptionsByGender),
      title: 'Suscripciones nuevas por género',
    }));
    charts.subsByGender = subsByGenderChart.toString('base64');
    // Subs by age
    const subsByAgeChart = await renderChart(pieChartConfig({
      labels: Object.keys(data.subscriptionsByAge),
      data: Object.values(data.subscriptionsByAge),
      title: 'Suscripciones nuevas por grupo de edad',
    }));
    charts.subsByAge = subsByAgeChart.toString('base64');
    // Top channels by subs
    const topChannelsBySubsChart = await renderChart(barChartConfig({
      labels: data.topChannelsBySubscriptions.map(c => c.channelName),
      datasets: [{ label: 'Suscripciones', data: data.topChannelsBySubscriptions.map(c => c.count) }],
      title: 'Top 5 canales por suscripciones',
      yLabel: 'Suscripciones',
    }));
    charts.topChannelsBySubs = topChannelsBySubsChart.toString('base64');
    // Top channels by clicks live
    const topChannelsByClicksLiveChart = await renderChart(barChartConfig({
      labels: data.topChannelsByClicksLive.map(c => c.channelName),
      datasets: [{ label: 'Clicks en vivo', data: data.topChannelsByClicksLive.map(c => c.count) }],
      title: 'Top 5 canales por clicks en YouTube (en vivo)',
      yLabel: 'Clicks',
    }));
    charts.topChannelsByClicksLive = topChannelsByClicksLiveChart.toString('base64');
    // Top channels by clicks deferred
    const topChannelsByClicksDeferredChart = await renderChart(barChartConfig({
      labels: data.topChannelsByClicksDeferred.map(c => c.channelName),
      datasets: [{ label: 'Clicks diferidos', data: data.topChannelsByClicksDeferred.map(c => c.count) }],
      title: 'Top 5 canales por clicks en YouTube (diferido)',
      yLabel: 'Clicks',
    }));
    charts.topChannelsByClicksDeferred = topChannelsByClicksDeferredChart.toString('base64');
    // Top programs by subs
    const topProgramsBySubsChart = await renderChart(barChartConfig({
      labels: data.topProgramsBySubscriptions.map(p => p.programName),
      datasets: [{ label: 'Suscripciones', data: data.topProgramsBySubscriptions.map(p => p.count) }],
      title: 'Top 5 programas por suscripciones',
      yLabel: 'Suscripciones',
    }));
    charts.topProgramsBySubs = topProgramsBySubsChart.toString('base64');
    // Top programs by clicks live
    const topProgramsByClicksLiveChart = await renderChart(barChartConfig({
      labels: data.topProgramsByClicksLive.map(p => p.programName),
      datasets: [{ label: 'Clicks en vivo', data: data.topProgramsByClicksLive.map(p => p.count) }],
      title: 'Top 5 programas por clicks en YouTube (en vivo)',
      yLabel: 'Clicks',
    }));
    charts.topProgramsByClicksLive = topProgramsByClicksLiveChart.toString('base64');
    // Top programs by clicks deferred
    const topProgramsByClicksDeferredChart = await renderChart(barChartConfig({
      labels: data.topProgramsByClicksDeferred.map(p => p.programName),
      datasets: [{ label: 'Clicks diferidos', data: data.topProgramsByClicksDeferred.map(p => p.count) }],
      title: 'Top 5 programas por clicks en YouTube (diferido)',
      yLabel: 'Clicks',
    }));
    charts.topProgramsByClicksDeferred = topProgramsByClicksDeferredChart.toString('base64');

    // 3. Generate PDF
    const pdfBuffer = await generateWeeklyReportPdf({ data, charts });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="weekly_report_${from}_to_${to}.pdf"`);
    res.send(pdfBuffer);
  }
} 