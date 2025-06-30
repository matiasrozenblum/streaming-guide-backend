import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StatisticsService } from './statistics.service';
import { User } from '../users/users.entity';
import { UserSubscription } from '../users/user-subscription.entity';
import { Program } from '../programs/programs.entity';
import { Channel } from '../channels/channels.entity';
import { ReportsProxyService } from './reports-proxy.service';
import { EmailService } from '../email/email.service';
import { Repository } from 'typeorm';

describe('StatisticsService', () => {
  let service: StatisticsService;
  let userRepo: Repository<User>;
  let subscriptionRepo: Repository<UserSubscription>;
  let programRepo: Repository<Program>;
  let channelRepo: Repository<Channel>;
  let reportsProxyService: ReportsProxyService;
  let emailService: EmailService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatisticsService,
        {
          provide: getRepositoryToken(User),
          useValue: { find: jest.fn(), count: jest.fn(), createQueryBuilder: jest.fn() },
        },
        {
          provide: getRepositoryToken(UserSubscription),
          useValue: { createQueryBuilder: jest.fn() },
        },
        {
          provide: getRepositoryToken(Program),
          useValue: { find: jest.fn() },
        },
        {
          provide: getRepositoryToken(Channel),
          useValue: { find: jest.fn() },
        },
        {
          provide: ReportsProxyService,
          useValue: { generateReport: jest.fn().mockResolvedValue(Buffer.from('test')) },
        },
        {
          provide: EmailService,
          useValue: { sendReportWithAttachment: jest.fn().mockResolvedValue(true) },
        },
      ],
    }).compile();

    service = module.get<StatisticsService>(StatisticsService);
    userRepo = module.get<Repository<User>>(getRepositoryToken(User));
    subscriptionRepo = module.get<Repository<UserSubscription>>(getRepositoryToken(UserSubscription));
    programRepo = module.get<Repository<Program>>(getRepositoryToken(Program));
    channelRepo = module.get<Repository<Channel>>(getRepositoryToken(Channel));
    reportsProxyService = module.get<ReportsProxyService>(ReportsProxyService);
    emailService = module.get<EmailService>(EmailService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // Add basic tests for each method (mocking query builders and dependencies)
  it('should get user demographics', async () => {
    (userRepo.find as jest.Mock).mockResolvedValue([{ gender: 'male', subscriptions: [{}], birthDate: '1990-01-01' }]);
    const result = await service.getUserDemographics();
    expect(result.totalUsers).toBe(1);
  });

  it('should get top programs', async () => {
    (userRepo.count as jest.Mock).mockResolvedValue(10);
    const mockQB = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([{ programid: 1, programname: 'Test', channelname: 'Test', subscriptioncount: 5 }]),
    };
    (subscriptionRepo.createQueryBuilder as jest.Mock).mockReturnValue(mockQB);
    const result = await service.getTopPrograms(10);
    expect(result[0].programId).toBe(1);
  });

  it('should get new users report', async () => {
    const mockQB = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[{ id: 1 }], 1]),
    };
    (userRepo.createQueryBuilder as jest.Mock).mockReturnValue(mockQB);
    const result = await service.getNewUsersReport('2024-01-01', '2024-01-31', 1, 20);
    expect(result.total).toBe(1);
    expect(result.users[0].id).toBe(1);
  });

  it('should get new subscriptions report', async () => {
    const mockQB = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[{ id: 1, user: {}, program: { id: 1, name: 'Test', channel: { id: 1, name: 'Test' } } }], 1]),
    };
    (subscriptionRepo.createQueryBuilder as jest.Mock).mockReturnValue(mockQB);
    const result = await service.getNewSubscriptionsReport('2024-01-01', '2024-01-31', 1, 20);
    expect(result.total).toBe(1);
    expect(result.subscriptions[0].id).toBe(1);
  });

  it('should download users report', async () => {
    const result = await service.downloadUsersReport('2024-01-01', '2024-01-31', 'csv');
    expect(reportsProxyService.generateReport).toHaveBeenCalled();
    expect(result).toBeInstanceOf(Buffer);
  });

  it('should download subscriptions report', async () => {
    const result = await service.downloadSubscriptionsReport('2024-01-01', '2024-01-31', 'csv', 1, 1);
    expect(reportsProxyService.generateReport).toHaveBeenCalled();
    expect(result).toBeInstanceOf(Buffer);
  });

  it('should email users report', async () => {
    const result = await service.emailUsersReport('2024-01-01', '2024-01-31', 'csv', 'test@example.com');
    expect(reportsProxyService.generateReport).toHaveBeenCalled();
    expect(result).toBeInstanceOf(Buffer);
  });

  it('should email subscriptions report', async () => {
    const result = await service.emailSubscriptionsReport('2024-01-01', '2024-01-31', 'csv', 1, 1, 'test@example.com');
    expect(reportsProxyService.generateReport).toHaveBeenCalled();
    expect(result).toBeInstanceOf(Buffer);
  });

  it('should get all programs stats', async () => {
    (programRepo.find as jest.Mock).mockResolvedValue([{ id: 1, name: 'Test', channel: { name: 'Test' } }]);
    (subscriptionRepo.createQueryBuilder as jest.Mock).mockReturnValue({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    });
    const result = await service.getAllProgramsStats();
    expect(Array.isArray(result)).toBe(true);
  });
}); 