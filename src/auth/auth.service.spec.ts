import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuthService } from './auth.service';
import { User, UserRole, AccountStatus } from './entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { PasswordReset } from './entities/password-reset.entity';
import { OtpVerification } from './entities/otp-verification.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import * as bcrypt from 'bcrypt';

// Mock bcrypt
jest.mock('bcrypt');
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

// Mock crypto properly
jest.mock('crypto', () => ({
  randomInt: jest.fn(() => 123456),
  createHash: jest.fn(() => ({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn(() => 'hashed-otp-code'),
  })),
}));

// Mock uuid - this will be overridden in specific tests
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mocked-uuid-token'),
}));

// Mock FileUploadService
const mockFileUploadService = {
  uploadSingleFile: jest.fn().mockResolvedValue({ url: 'https://example.com/avatar.jpg', publicId: 'test-id' }),
  deleteFileByUrl: jest.fn().mockResolvedValue(true),
  deleteFile: jest.fn().mockResolvedValue(true),
};

describe('AuthService', () => {
  let service: AuthService;
  let userRepository: any;
  let refreshTokenRepository: any;
  let passwordResetRepository: any;
  let otpRepository: any;
  let jwtService: any;
  let eventEmitter: any;

  // Mock repositories
  const mockUserRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    findAndCount: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  const mockRefreshTokenRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const mockPasswordResetRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const mockOtpRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
    verify: jest.fn(() => ({ userId: 'test-user-id' })),
  };

  const mockEventEmitter = {
    emitAsync: jest.fn().mockResolvedValue(true),
    emit: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, any> = {
        'appConfig.auth.bcryptSaltRounds': 12,
        'appConfig.auth.jwtVerificationSecret': 'verification-secret',
        'appConfig.auth.jwtAccessSecret': 'access-secret',
        'appConfig.auth.jwtAccessExpiry': '15m',
        'appConfig.frontendUrl': 'http://localhost:3000',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        { provide: getRepositoryToken(RefreshToken), useValue: mockRefreshTokenRepository },
        { provide: getRepositoryToken(PasswordReset), useValue: mockPasswordResetRepository },
        { provide: getRepositoryToken(OtpVerification), useValue: mockOtpRepository },
        { provide: JwtService, useValue: mockJwtService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: 'FileUploadService', useValue: mockFileUploadService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userRepository = module.get(getRepositoryToken(User));
    refreshTokenRepository = module.get(getRepositoryToken(RefreshToken));
    passwordResetRepository = module.get(getRepositoryToken(PasswordReset));
    otpRepository = module.get(getRepositoryToken(OtpVerification));
    jwtService = module.get(JwtService);
    eventEmitter = module.get(EventEmitter2);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ==================== REGISTRATION TESTS ====================
  describe('register', () => {
    const registerDto: RegisterDto = {
      email: 'test@example.com',
      name: 'Test User',
      password: 'Test123!@#',
    };

    it('should successfully register a new user', async () => {
      // Arrange: Mock no existing user and successful user creation
      userRepository.findOne.mockResolvedValue(null);
      mockedBcrypt.hash.mockResolvedValue('hashed-password' as never);
      userRepository.create.mockReturnValue({ id: 'user-id', ...registerDto });
      userRepository.save.mockResolvedValue({ id: 'user-id', ...registerDto, password: 'hashed-password' });
      mockJwtService.sign.mockReturnValue('verification-token');

      // Act: Call register method
      const result = await service.register(registerDto);

      // Assert: Verify registration was successful
      expect(result.message).toContain('Registration successful');
      expect(result.user.email).toBe(registerDto.email);
      expect(userRepository.create).toHaveBeenCalled();
      expect(userRepository.save).toHaveBeenCalled();
      expect(eventEmitter.emitAsync).toHaveBeenCalled();
    });

    it('should throw ConflictException when email already exists', async () => {
      // Arrange: Mock existing user
      userRepository.findOne.mockResolvedValue({ email: registerDto.email });

      // Act & Assert: Verify exception is thrown
      await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
      expect(userRepository.save).not.toHaveBeenCalled();
    });
  });

  // ==================== LOGIN TESTS ====================
  describe('login', () => {
    const loginDto: LoginDto = {
      email: 'test@example.com',
      password: 'Test123!@#',
    };
    const mockUser = {
      id: 'user-id',
      email: 'test@example.com',
      name: 'Test User',
      password: 'hashed-password',
      role: UserRole.USER,
      status: AccountStatus.ACTIVE,
      loginAttempts: 0,
      lockedUntil: null,
      emailVerifiedAt: new Date(),
      isLocked: () => false,
      isEmailVerified: () => true,
    };

    it('should successfully login with valid credentials', async () => {
      // Arrange: Mock valid user and successful password comparison
      userRepository.findOne.mockResolvedValue(mockUser);
      mockedBcrypt.compare.mockResolvedValue(true as never);
      userRepository.save.mockResolvedValue(mockUser);

      // Mock JWT service to return access token
      mockJwtService.sign.mockReturnValue('test-access-token-456');

      // Act: Call login method
      const result = await service.login(loginDto, '127.0.0.1', 'Mozilla/5.0');

      // Assert: Verify access token is returned (refresh token will be the mocked uuid)
      expect(result.accessToken).toBe('test-access-token-456');
      expect(result.user.email).toBe(loginDto.email);
      // Note: refreshToken is mocked by uuid, so we just check it exists
      expect(result.refreshToken).toBeDefined();
    });

    it('should throw UnauthorizedException for invalid credentials', async () => {
      // Arrange: Mock user exists but password is incorrect
      userRepository.findOne.mockResolvedValue(mockUser);
      mockedBcrypt.compare.mockResolvedValue(false as never);

      // Act & Assert: Verify exception is thrown
      await expect(service.login(loginDto, '127.0.0.1', 'Mozilla/5.0')).rejects.toThrow(UnauthorizedException);
    });
  });

  // ==================== FORGOT PASSWORD TESTS ====================
  describe('forgotPassword', () => {
    const forgotPasswordDto = { email: 'test@example.com' };
    const mockUser = { id: 'user-id', email: 'test@example.com' };

    it('should return success message even if user not found (security best practice)', async () => {
      // Arrange: Mock user not found
      userRepository.findOne.mockResolvedValue(null);

      // Act: Call forgot password
      const result = await service.forgotPassword(forgotPasswordDto);

      // Assert: Verify generic message (doesn't reveal user existence)
      expect(result.message).toContain('A password reset link has been sent');
      expect(passwordResetRepository.create).not.toHaveBeenCalled();
    });

    it('should create reset token for existing user', async () => {
      // Arrange: Mock existing user
      userRepository.findOne.mockResolvedValue(mockUser);
      passwordResetRepository.findOne.mockResolvedValue(null);
      passwordResetRepository.create.mockReturnValue({ token: 'reset-token' });
      passwordResetRepository.save.mockResolvedValue({});

      // Act: Call forgot password
      const result = await service.forgotPassword(forgotPasswordDto);

      // Assert: Verify reset token created and event emitted
      expect(result.message).toContain('password reset link has been sent');
      expect(passwordResetRepository.create).toHaveBeenCalled();
      expect(eventEmitter.emitAsync).toHaveBeenCalled();
    });
  });

  // ==================== RESET PASSWORD TESTS ====================
  describe('resetPassword', () => {
    const resetPasswordDto = {
      token: 'valid-token',
      newPassword: 'NewTest123!@#',
    };
    const mockPasswordReset = {
      token: 'valid-token',
      isUsed: false,
      expiresAt: new Date(Date.now() + 3600000),
      canBeUsed: () => true,
      user: { id: 'user-id', password: 'old-hash' },
    };

    it('should successfully reset password', async () => {
      // Arrange: Mock valid reset token
      passwordResetRepository.findOne.mockResolvedValue(mockPasswordReset);
      mockedBcrypt.hash.mockResolvedValue('new-hashed-password' as never);
      userRepository.save.mockResolvedValue({});
      passwordResetRepository.save.mockResolvedValue({});
      refreshTokenRepository.update.mockResolvedValue({});

      // Act: Reset password
      const result = await service.resetPassword(resetPasswordDto);

      // Assert: Verify password reset successful
      expect(result.message).toContain('Password reset successful');
      expect(eventEmitter.emitAsync).toHaveBeenCalled();
    });

    it('should throw BadRequestException for invalid token', async () => {
      // Arrange: Mock invalid token
      passwordResetRepository.findOne.mockResolvedValue(null);

      // Act & Assert: Verify exception thrown
      await expect(service.resetPassword(resetPasswordDto)).rejects.toThrow(BadRequestException);
    });
  });

  // ==================== TOKEN EXPIRATION SCENARIOS ====================
  describe('Token Expiration Scenarios', () => {
    it('should reject expired refresh tokens', async () => {
      // Arrange: Mock expired token
      const expiredToken = {
        token: 'expired-token',
        isValid: () => false,
        isExpired: () => true,
      };
      refreshTokenRepository.findOne.mockResolvedValue(expiredToken);

      // Act & Assert: Verify exception thrown for expired token
      await expect(service.refreshToken('expired-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should reject refresh tokens that are already revoked', async () => {
      // Arrange: Mock revoked token
      const revokedToken = {
        token: 'revoked-token',
        isValid: () => false,
        isRevoked: () => true,
        revokedAt: new Date(),
      };
      refreshTokenRepository.findOne.mockResolvedValue(revokedToken);

      // Act & Assert: Verify exception thrown for revoked token
      await expect(service.refreshToken('revoked-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should generate new tokens with valid refresh token', async () => {
      // Arrange: Mock valid refresh token
      const mockTokenEntity = {
        token: 'valid-token',
        isValid: () => true,
        user: { id: 'user-id', email: 'test@example.com', role: 'user' },
        userAgent: 'Mozilla/5.0',
        ipAddress: '127.0.0.1',
      };
      refreshTokenRepository.findOne.mockResolvedValue(mockTokenEntity);
      refreshTokenRepository.save.mockResolvedValue({});
      // Mock JWT service to return new access token
      mockJwtService.sign.mockReturnValue('new-access-token-101112');

      // Act: Refresh token
      const result = await service.refreshToken('valid-token');

      // Assert: Verify new access token generated (refresh token will be mocked uuid)
      expect(result.accessToken).toBe('new-access-token-101112');
      expect(result.refreshToken).toBeDefined();
    });
  });

  // ==================== CHANGE PASSWORD TESTS ====================
  describe('changePassword', () => {
    const changePasswordDto: ChangePasswordDto = {
      currentPassword: 'OldPass123!@#',
      newPassword: 'NewPass123!@#',
    };

    const mockUser = {
      id: 'user-id',
      password: 'hashed-old-password',
    };

    it('should successfully change password with valid current password', async () => {
      // Arrange: Mock valid current password
      userRepository.findOne.mockResolvedValue(mockUser);
      mockedBcrypt.compare.mockResolvedValue(true as never);
      mockedBcrypt.hash.mockResolvedValue('hashed-new-password' as never);
      userRepository.save.mockResolvedValue({ ...mockUser, password: 'hashed-new-password' });
      refreshTokenRepository.update.mockResolvedValue({});

      // Act: Change password
      const result = await service.changePassword('user-id', changePasswordDto);

      // Assert: Verify password changed successfully
      expect(result.message).toContain('Password changed successfully');
      expect(userRepository.save).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when current password is incorrect', async () => {
      // Arrange: Mock incorrect current password
      userRepository.findOne.mockResolvedValue(mockUser);
      mockedBcrypt.compare.mockResolvedValue(false as never);

      // Act & Assert: Verify exception thrown
      await expect(service.changePassword('user-id', changePasswordDto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw NotFoundException when user does not exist', async () => {
      // Arrange: Mock user not found
      userRepository.findOne.mockResolvedValue(null);

      // Act & Assert: Verify exception thrown
      await expect(service.changePassword('non-existent-id', changePasswordDto)).rejects.toThrow(NotFoundException);
    });

    it('should revoke all other sessions when password changes', async () => {
      // Arrange: Mock successful password change
      userRepository.findOne.mockResolvedValue(mockUser);
      mockedBcrypt.compare.mockResolvedValue(true as never);
      mockedBcrypt.hash.mockResolvedValue('hashed-new-password' as never);
      userRepository.save.mockResolvedValue({});

      // Act: Change password
      await service.changePassword('user-id', changePasswordDto);

      // Assert: Verify refresh tokens were updated
      expect(refreshTokenRepository.update).toHaveBeenCalled();
      const updateCall = refreshTokenRepository.update.mock.calls[0];
      expect(updateCall[0]).toHaveProperty('userId', 'user-id');
      expect(updateCall[1]).toHaveProperty('revokedReason', 'Password changed');
    });
  });

  // ==================== UPDATE PROFILE TESTS ====================
  describe('updateProfile', () => {
    const updateProfileDto: UpdateProfileDto = {
      name: 'Updated Name',
    };

    const mockUser = {
      id: 'user-id',
      email: 'test@example.com',
      name: 'Original Name',
      profilePicture: null,
    };

    it('should successfully update user name', async () => {
      // Arrange: Mock user exists
      userRepository.findOne.mockResolvedValue(mockUser);
      userRepository.save.mockResolvedValue({ ...mockUser, name: 'Updated Name' });

      // Act: Update profile
      const result = await service.updateProfile('user-id', updateProfileDto);

      // Assert: Verify name updated
      expect(result.message).toContain('Profile updated successfully');
      expect(result.user.name).toBe('Updated Name');
    });

    it('should upload profile picture when file provided', async () => {
      // Arrange: Mock file upload
      const mockFile = { originalname: 'avatar.jpg' } as Express.Multer.File;
      const mockUploadResult = { url: 'https://cloudinary.com/avatar.jpg' };
      mockFileUploadService.uploadSingleFile.mockResolvedValue(mockUploadResult);
      userRepository.findOne.mockResolvedValue(mockUser);
      userRepository.save.mockResolvedValue({ ...mockUser, profilePicture: mockUploadResult.url });

      // Act: Update profile with picture
      const result = await service.updateProfile('user-id', {}, mockFile);

      // Assert: Verify picture uploaded
      expect(mockFileUploadService.uploadSingleFile).toHaveBeenCalled();
      expect(result.user.profilePicture).toBe(mockUploadResult.url);
    });

    it('should throw NotFoundException when user not found', async () => {
      // Arrange: Mock user not found
      userRepository.findOne.mockResolvedValue(null);

      // Act & Assert: Verify exception thrown
      await expect(service.updateProfile('non-existent-id', updateProfileDto)).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== CREATE ADMIN TESTS ====================
  describe('createAdmin', () => {
    const registerDto: RegisterDto = {
      email: 'newadmin@example.com',
      name: 'New Admin',
      password: 'Admin123!@#',
    };

    const mockAdminCreator = {
      id: 'admin-id',
      role: UserRole.ADMIN,
    };

    it('should successfully create admin when creator has ADMIN role', async () => {
      // Arrange: Mock admin creator and no existing user
      userRepository.findOne.mockResolvedValueOnce(mockAdminCreator);
      userRepository.findOne.mockResolvedValueOnce(null);
      mockedBcrypt.hash.mockResolvedValue('hashed-password' as never);
      userRepository.create.mockReturnValue({ id: 'new-admin-id', ...registerDto, role: UserRole.ADMIN });
      userRepository.save.mockResolvedValue({ id: 'new-admin-id', ...registerDto, role: UserRole.ADMIN });

      // Act: Create admin
      const result = await service.createAdmin(registerDto, 'admin-id');

      // Assert: Verify admin created
      expect(result.message).toContain('Admin user created successfully');
      expect(result.user.role).toBe(UserRole.ADMIN);
    });

    it('should throw UnauthorizedException when creator is not admin', async () => {
      // Arrange: Mock regular user as creator
      const regularUser = { id: 'user-id', role: UserRole.USER };
      userRepository.findOne.mockResolvedValue(regularUser);

      // Act & Assert: Verify exception thrown
      await expect(service.createAdmin(registerDto, 'user-id')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw ConflictException when admin email already exists', async () => {
      // Arrange: Mock existing email
      userRepository.findOne.mockResolvedValueOnce(mockAdminCreator);
      userRepository.findOne.mockResolvedValueOnce({ email: registerDto.email });

      // Act & Assert: Verify exception thrown
      await expect(service.createAdmin(registerDto, 'admin-id')).rejects.toThrow(ConflictException);
    });
  });

  // ==================== GET ALL USERS TESTS ====================
  describe('getAllUsers', () => {
    const mockUsers = [
      { id: '1', email: 'user1@example.com', name: 'User 1', role: UserRole.USER },
      { id: '2', email: 'user2@example.com', name: 'User 2', role: UserRole.USER },
      { id: '3', email: 'admin@example.com', name: 'Admin', role: UserRole.ADMIN },
    ];

    it('should return paginated users list', async () => {
      // Arrange: Mock users list
      userRepository.findAndCount.mockResolvedValue([mockUsers, 3]);

      // Act: Get all users
      const result = await service.getAllUsers(1, 10);

      // Assert: Verify paginated results
      expect(result.users).toHaveLength(3);
      expect(result.total).toBe(3);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.totalPages).toBe(1);
    });

    it('should return empty array when no users exist', async () => {
      // Arrange: Mock empty users list
      userRepository.findAndCount.mockResolvedValue([[], 0]);

      // Act: Get all users
      const result = await service.getAllUsers(1, 10);

      // Assert: Verify empty result
      expect(result.users).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });
  });

  // ==================== OTP VERIFICATION TESTS ====================
  describe('OTP Verification', () => {
    it('should send OTP successfully', async () => {
      // Arrange: Mock OTP creation
      otpRepository.update.mockResolvedValue({});
      otpRepository.create.mockReturnValue({});
      otpRepository.save.mockResolvedValue({});

      // Act: Send OTP
      const result = await service.sendOtp('test@example.com');

      // Assert: Verify OTP sent
      expect(result.message).toContain('verification code has been dispatched');
      expect(otpRepository.create).toHaveBeenCalled();
      expect(otpRepository.save).toHaveBeenCalled();
    });

    it('should verify OTP successfully', async () => {
      // Arrange: Mock valid OTP record
      const mockOtpRecord = {
        id: 'otp-id',
        isUsed: false,
        expiresAt: new Date(Date.now() + 300000),
      };
      otpRepository.findOne.mockResolvedValue(mockOtpRecord);
      otpRepository.save.mockResolvedValue({ ...mockOtpRecord, isUsed: true });

      // Act: Verify OTP
      const result = await service.verifyOtp('test@example.com', '123456');

      // Assert: Verify OTP verified
      expect(result).toBe(true);
    });

    it('should throw error for invalid OTP', async () => {
      // Arrange: Mock OTP not found
      otpRepository.findOne.mockResolvedValue(null);

      // Act & Assert: Verify exception thrown
      await expect(service.verifyOtp('test@example.com', '000000')).rejects.toThrow(BadRequestException);
    });
  });

  // ==================== VERIFY OTP AND LOGIN TESTS ====================
  describe('verifyOtpAndLogin', () => {
    const mockUser = {
      id: 'user-id',
      email: 'test@example.com',
      name: 'Test User',
      role: UserRole.USER,
      lockedUntil: null,
    };

    it('should successfully login with valid OTP', async () => {
      // Arrange: Mock OTP verification and token generation
      jest.spyOn(service, 'verifyOtp').mockResolvedValue(true);
      userRepository.findOne.mockResolvedValue(mockUser);
      // Mock JWT service for access token
      mockJwtService.sign.mockReturnValue('otp-access-token');

      // Act: Verify OTP and login
      const result = await service.verifyOtpAndLogin('test@example.com', '123456', '127.0.0.1', 'Mozilla/5.0');

      // Assert: Verify successful login
      expect(result.accessToken).toBe('otp-access-token');
      // Refresh token is the mocked uuid
      expect(result.refreshToken).toBeDefined();
      expect(result.user.email).toBe('test@example.com');
    });

    it('should throw error for locked account', async () => {
      // Arrange: Mock locked account
      const lockedUser = {
        id: 'user-id',
        email: 'test@example.com',
        lockedUntil: new Date(Date.now() + 900000),
      };
      jest.spyOn(service, 'verifyOtp').mockResolvedValue(true);
      userRepository.findOne.mockResolvedValue(lockedUser);

      // Act & Assert: Verify exception thrown for locked account
      await expect(service.verifyOtpAndLogin('test@example.com', '123456', '127.0.0.1', 'Mozilla/5.0'))
        .rejects.toThrow(BadRequestException);
    });
  });

  // ==================== GOOGLE OAUTH TESTS ====================
  describe('Google OAuth', () => {
    const googleProfile = {
      email: 'google@example.com',
      name: 'Google User',
      provider: 'google',
      providerId: '123456789',
    };

    it('should create new user for first-time Google login', async () => {
      // Arrange: Mock no existing user
      userRepository.findOne.mockResolvedValue(null);
      userRepository.create.mockReturnValue({ ...googleProfile, id: 'new-user-id' });
      userRepository.save.mockResolvedValue({ ...googleProfile, id: 'new-user-id' });
      mockJwtService.sign.mockReturnValue('google-access-token');

      // Act: Validate social login
      const result = await service.validateSocialLogin(googleProfile, '127.0.0.1', 'Mozilla/5.0');

      // Assert: Verify new user created
      expect(result.accessToken).toBe('google-access-token');
      expect(result.refreshToken).toBeDefined();
      expect(userRepository.create).toHaveBeenCalled();
    });

    it('should link Google account to existing email user', async () => {
      // Arrange: Mock existing user without Google
      const existingUser = {
        id: 'existing-id',
        email: googleProfile.email,
        name: 'Existing User',
        provider: null,
        providerId: null,
      };
      userRepository.findOne.mockResolvedValue(existingUser);
      userRepository.save.mockResolvedValue({ ...existingUser, provider: 'google', providerId: '123456789' });
      mockJwtService.sign.mockReturnValue('google-access-token');

      // Act: Validate social login
      const result = await service.validateSocialLogin(googleProfile, '127.0.0.1', 'Mozilla/5.0');

      // Assert: Verify account linked
      expect(result.accessToken).toBe('google-access-token');
      expect(result.refreshToken).toBeDefined();
      expect(userRepository.save).toHaveBeenCalled();
    });

    it('should return tokens for returning Google user', async () => {
      // Arrange: Mock existing Google user
      const existingGoogleUser = {
        id: 'google-id',
        email: googleProfile.email,
        name: googleProfile.name,
        provider: 'google',
        providerId: '123456789',
      };
      userRepository.findOne.mockResolvedValue(existingGoogleUser);
      mockJwtService.sign.mockReturnValue('google-access-token');

      // Act: Validate social login
      const result = await service.validateSocialLogin(googleProfile, '127.0.0.1', 'Mozilla/5.0');

      // Assert: Verify tokens returned
      expect(result.accessToken).toBe('google-access-token');
      expect(result.refreshToken).toBeDefined();
    });
  });
});

// npm run test -- --testPathIgnorePatterns="integration"