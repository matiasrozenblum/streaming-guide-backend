import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class ReportsProxyService {
  private readonly reportsServiceUrl: string;

  constructor() {
    this.reportsServiceUrl = process.env.REPORTS_SERVICE_URL || 'http://reports:3001';
  }

  async generateReport(request: {
    type: 'users' | 'subscriptions' | 'weekly-summary' | 'monthly-summary' | 'quarterly-summary' | 'yearly-summary' | 'channel-summary' | 'comprehensive-channel-summary';
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
      
      return Buffer.from(response.data);
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

  async generatePeriodicReport(params: { 
    type: 'monthly-summary' | 'quarterly-summary' | 'yearly-summary';
    from: string; 
    to: string; 
    channelId?: number 
  }): Promise<Buffer> {
    try {
      const response = await axios.post(
        `${this.reportsServiceUrl}/reports/periodic`,
        params,
        {
          responseType: 'arraybuffer',
          timeout: 60000, // 60 seconds timeout for periodic reports
        }
      );
      
      return Buffer.from(response.data);
    } catch (error) {
      console.error('Error calling reports service for periodic report:', error.message);
      throw new HttpException(
        'Failed to generate periodic report. Please try again later.',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async generateChannelReport(params: { 
    channelId: number;
    from: string; 
    to: string; 
    format: 'csv' | 'pdf';
  }): Promise<Buffer> {
    try {
      const response = await axios.post(
        `${this.reportsServiceUrl}/reports/channel`,
        params,
        {
          responseType: 'arraybuffer',
          timeout: 45000, // 45 seconds timeout for channel reports
        }
      );
      
      return Buffer.from(response.data);
    } catch (error) {
      console.error('Error calling reports service for channel report:', error.message);
      throw new HttpException(
        'Failed to generate channel report. Please try again later.',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async generateComprehensiveChannelReport(params: { 
    channelId: number;
    from: string; 
    to: string; 
    format: 'csv' | 'pdf';
  }): Promise<Buffer> {
    try {
      const response = await axios.post(
        `${this.reportsServiceUrl}/reports/comprehensive-channel`,
        params,
        {
          responseType: 'arraybuffer',
          timeout: 60000, // 60 seconds timeout for comprehensive channel reports
        }
      );
      
      return Buffer.from(response.data);
    } catch (error) {
      console.error('Error calling reports service for comprehensive channel report:', error.message);
      throw new HttpException(
        'Failed to generate comprehensive channel report. Please try again later.',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
} 