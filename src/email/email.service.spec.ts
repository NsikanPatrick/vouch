import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EmailService } from './email.service';
import { EmailLog, EmailStatus } from './entities/email-log.entity';
import { User } from '../auth/entities/user.entity';

// Mock Resend
const mockResendSend = jest.fn();
const mockResendDomains = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockResendSend },
    domains: { list: mockResendDomains },
  })),
}));

describe('EmailService', () => {
  let service: EmailService;
  let emailLogRepository: any;
  let eventEmitter: any;

  const mockEmailLogRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    findAndCount: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    })),
    count: jest.fn().mockResolvedValue(0),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config = {
        'RESEND_API_KEY': 'test-api-key-12345',
        'appConfig.email.fromAddress': 'test@resend.dev',
        'appConfig.frontendUrl': 'http://localhost:3000',
      };
      return config[key];
    }),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        { provide: getRepositoryToken(EmailLog), useValue: mockEmailLogRepository },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<EmailService>(EmailService);
    emailLogRepository = module.get(getRepositoryToken(EmailLog));
    eventEmitter = module.get(EventEmitter2);

    // Wait for onModuleInit to complete
    await service.onModuleInit();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sendWelcomeEmail', () => {
    const mockUser = {
      id: 'user-id',
      email: 'test@example.com',
      name: 'Test User',
    } as User;

    it('should log and send welcome email successfully', async () => {
      // Arrange
      const mockEmailLog = { id: 'log-id', status: EmailStatus.PENDING };
      mockEmailLogRepository.create.mockReturnValue(mockEmailLog);
      mockEmailLogRepository.save.mockResolvedValue(mockEmailLog);

      const mockResendResponse = { data: { id: 'resend-id' }, error: null };
      mockResendSend.mockResolvedValue(mockResendResponse);

      // Act
      await service.sendWelcomeEmail(mockUser, mockUser.name, 'verification-token');

      // Assert
      expect(mockEmailLogRepository.create).toHaveBeenCalled();
      expect(mockEmailLogRepository.save).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith('email.sent', expect.any(Object));
    });

    it('should handle email sending failure', async () => {
      // Arrange
      const mockEmailLog = { id: 'log-id', status: EmailStatus.PENDING };
      mockEmailLogRepository.create.mockReturnValue(mockEmailLog);
      mockEmailLogRepository.save.mockResolvedValue(mockEmailLog);

      const mockErrorResponse = { data: null, error: { message: 'Failed to send' } };
      mockResendSend.mockResolvedValue(mockErrorResponse);

      // Act & Assert
      await expect(service.sendWelcomeEmail(mockUser, mockUser.name, 'verification-token'))
        .rejects.toThrow();
    });
  });
});