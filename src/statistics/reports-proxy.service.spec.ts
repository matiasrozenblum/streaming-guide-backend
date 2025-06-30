import { ReportsProxyService } from './reports-proxy.service';
import axios from 'axios';

jest.mock('axios');

describe('ReportsProxyService', () => {
  let service: ReportsProxyService;
  const mockResponse = { data: Buffer.from('test') };

  beforeEach(() => {
    service = new ReportsProxyService();
    (axios.post as jest.Mock).mockResolvedValue(mockResponse);
    (axios.get as jest.Mock).mockResolvedValue(mockResponse);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should generate report', async () => {
    const result = await service.generateReport({ type: 'users', format: 'csv', from: '2024-01-01', to: '2024-01-31' });
    expect(axios.post).toHaveBeenCalled();
    expect(result).toEqual(Buffer.from('test'));
  });

  it('should handle error in generateReport', async () => {
    (axios.post as jest.Mock).mockRejectedValueOnce(new Error('fail'));
    await expect(service.generateReport({ type: 'users', format: 'csv', from: '2024-01-01', to: '2024-01-31' })).rejects.toThrow('Failed to generate report. Please try again later.');
  });

  it('should generate weekly report', async () => {
    const result = await service.generateWeeklyReport({ from: '2024-01-01', to: '2024-01-31' });
    expect(axios.get).toHaveBeenCalled();
    expect(result).toBeInstanceOf(Buffer);
  });

  it('should handle error in generateWeeklyReport', async () => {
    (axios.get as jest.Mock).mockRejectedValueOnce(new Error('fail'));
    await expect(service.generateWeeklyReport({ from: '2024-01-01', to: '2024-01-31' })).rejects.toThrow('Failed to generate weekly report. Please try again later.');
  });
}); 