import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class ReportsProxyService {
  private readonly reportsServiceUrl: string;

  constructor() {
    this.reportsServiceUrl = process.env.REPORTS_SERVICE_URL || 'http://reports:3001';
  }

  async generateReport(request: {
    type: 'users' | 'subscriptions' | 'weekly-summary';
    format: 'csv' | 'pdf';
    from: string;
    to: string;
    channelId?: number;
    programId?: number;
    toEmail?: string;
  }): Promise<Buffer | string> {
    try {
      const response = await axios.post(
        `${this.reportsServiceUrl}/reports/generate`,
        request,
        {
          responseType: 'arraybuffer',
          timeout: 30000, // 30 seconds timeout
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('Error calling reports service:', error.message);
      throw new HttpException(
        'Failed to generate report. Please try again later.',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async generateWeeklyReport(params: { from: string; to: string; channelId?: number }): Promise<Buffer> {
    try {
      const response = await axios.get(
        `${this.reportsServiceUrl}/reports/weekly-summary/download`,
        {
          params,
          responseType: 'arraybuffer',
          timeout: 60000, // 60 seconds timeout for weekly reports
        }
      );
      
      return Buffer.from(response.data);
    } catch (error) {
      console.error('Error calling reports service for weekly report:', error.message);
      throw new HttpException(
        'Failed to generate weekly report. Please try again later.',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
} 