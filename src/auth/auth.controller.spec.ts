import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RequestOtpDto, VerifyOtpDto } from './dto/otp.dto';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: any;

  // Mock request with user object for admin endpoints
  const mockRequestWithUser = {
    user: { id: 'admin-id', email: 'admin@example.com', role: 'admin' },
  };

  // Mock AuthService with all methods - spies for verifying calls
  const mockAuthService = {
    register: jest.fn(),
    login: jest.fn(),
    verifyEmail: jest.fn(),
    refreshToken: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
    logout: jest.fn(),
    getUserById: jest.fn(),
    changePassword: jest.fn(),
    createAdmin: jest.fn(),
    getAllUsers: jest.fn(),
    updateUserStatus: jest.fn(),
    deleteUser: jest.fn(),
    sendOtp: jest.fn(),
    verifyOtpAndLogin: jest.fn(),
    updateProfile: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ==================== PUBLIC ROUTES TESTS ====================
  // These endpoints do not require authentication

  describe('register', () => {
    it('should call authService.register with DTO and return result', async () => {
      // Arrange: Create registration DTO with valid data
      const dto: RegisterDto = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'Test123!@#',
      };
      const expectedResult = { user: { email: dto.email }, message: 'Registration successful' };
      mockAuthService.register.mockResolvedValue(expectedResult);

      // Act: Call the register endpoint
      const result = await controller.register(dto);

      // Assert: Verify service was called correctly and result returned
      expect(authService.register).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('login', () => {
    it('should call authService.login with DTO, IP, and User-Agent', async () => {
      // Arrange: Create login DTO and mock request data
      const dto: LoginDto = { email: 'test@example.com', password: 'Test123!@#' };
      const ip = '127.0.0.1';
      const userAgent = 'Mozilla/5.0';
      const expectedResult = { accessToken: 'token', refreshToken: 'refresh', user: { email: dto.email } };
      mockAuthService.login.mockResolvedValue(expectedResult);

      // Act: Call the login endpoint
      const result = await controller.login(dto, ip, userAgent);

      // Assert: Verify service received all parameters and returns expected result
      expect(authService.login).toHaveBeenCalledWith(dto, ip, userAgent);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('verifyEmail', () => {
    it('should call authService.verifyEmail with token', async () => {
      // Arrange: Create verification token
      const token = 'verification-token';
      const expectedResult = { message: 'Email verified successfully' };
      mockAuthService.verifyEmail.mockResolvedValue(expectedResult);

      // Act: Call verify email endpoint
      const result = await controller.verifyEmail(token);

      // Assert: Verify service was called with token
      expect(authService.verifyEmail).toHaveBeenCalledWith(token);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('refreshToken', () => {
    it('should call authService.refreshToken with refresh token', async () => {
      // Arrange: Create refresh token string
      const refreshToken = 'valid-refresh-token';
      const expectedResult = { accessToken: 'new-access-token', refreshToken: 'new-refresh-token' };
      mockAuthService.refreshToken.mockResolvedValue(expectedResult);

      // Act: Call refresh token endpoint
      const result = await controller.refreshToken(refreshToken);

      // Assert: Verify service received refresh token
      expect(authService.refreshToken).toHaveBeenCalledWith(refreshToken);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('forgotPassword', () => {
    it('should call authService.forgotPassword with DTO', async () => {
      // Arrange: Create forgot password DTO
      const dto: ForgotPasswordDto = { email: 'test@example.com' };
      const expectedResult = { message: 'Password reset link sent' };
      mockAuthService.forgotPassword.mockResolvedValue(expectedResult);

      // Act: Call forgot password endpoint
      const result = await controller.forgotPassword(dto);

      // Assert: Verify service was called with DTO
      expect(authService.forgotPassword).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('resetPassword', () => {
    it('should call authService.resetPassword with DTO', async () => {
      // Arrange: Create reset password DTO
      const dto: ResetPasswordDto = { token: 'reset-token', newPassword: 'NewPass123!@#' };
      const expectedResult = { message: 'Password reset successful' };
      mockAuthService.resetPassword.mockResolvedValue(expectedResult);

      // Act: Call reset password endpoint
      const result = await controller.resetPassword(dto);

      // Assert: Verify service was called with DTO
      expect(authService.resetPassword).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expectedResult);
    });
  });

  // ==================== PROTECTED ROUTES TESTS ====================
  // These endpoints require authentication (JWT token)

  describe('logout', () => {
    it('should call authService.logout with userId and optional refreshToken', async () => {
      // Arrange: Mock user ID and refresh token
      const userId = 'user-id';
      const refreshToken = 'refresh-token';
      const expectedResult = { message: 'Logged out successfully' };
      mockAuthService.logout.mockResolvedValue(expectedResult);

      // Act: Call logout endpoint with both parameters
      const result = await controller.logout(userId, refreshToken);

      // Assert: Verify service called with correct parameters
      expect(authService.logout).toHaveBeenCalledWith(userId, refreshToken);
      expect(result).toEqual(expectedResult);
    });

    it('should call authService.logout without refreshToken when not provided', async () => {
      // Arrange: Mock user ID only
      const userId = 'user-id';
      const expectedResult = { message: 'Logged out successfully' };
      mockAuthService.logout.mockResolvedValue(expectedResult);

      // Act: Call logout endpoint without refresh token
      const result = await controller.logout(userId, undefined);

      // Assert: Verify service called with only userId
      expect(authService.logout).toHaveBeenCalledWith(userId, undefined);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('getProfile', () => {
    it('should return user profile from authService', async () => {
      // Arrange: Mock current user from JWT and expected profile
      const currentUser = { id: 'user-id', email: 'test@example.com' };
      const expectedProfile = { id: 'user-id', email: 'test@example.com', name: 'Test User' };
      mockAuthService.getUserById.mockResolvedValue(expectedProfile);

      // Act: Call profile endpoint
      const result = await controller.getProfile(currentUser);

      // Assert: Verify service called with user ID and profile returned
      expect(authService.getUserById).toHaveBeenCalledWith('user-id');
      expect(result).toEqual(expectedProfile);
    });
  });

  describe('updateProfile', () => {
    it('should call authService.updateProfile with userId, DTO, and file', async () => {
      // Arrange: Mock user ID, update DTO, and valid file
      const userId = 'user-id';
      const updateDto = { name: 'Updated Name' };
      const mockFile = {
        originalname: 'avatar.jpg',
        mimetype: 'image/jpeg',
        size: 1024 * 1024,
        buffer: Buffer.from(''),
      } as Express.Multer.File;
      const expectedResult = { message: 'Profile updated', user: { name: 'Updated Name' } };
      mockAuthService.updateProfile.mockResolvedValue(expectedResult);

      // Act: Call update profile endpoint
      const result = await controller.updateProfile(userId, updateDto, mockFile);

      // Assert: Verify service called with all parameters
      expect(authService.updateProfile).toHaveBeenCalledWith(userId, updateDto, mockFile);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('changePassword', () => {
    it('should call authService.changePassword with userId and DTO', async () => {
      // Arrange: Mock user ID and change password DTO
      const userId = 'user-id';
      const dto: ChangePasswordDto = { currentPassword: 'OldPass123!@#', newPassword: 'NewPass123!@#' };
      const expectedResult = { message: 'Password changed successfully' };
      mockAuthService.changePassword.mockResolvedValue(expectedResult);

      // Act: Call change password endpoint
      const result = await controller.changePassword(userId, dto);

      // Assert: Verify service called with correct parameters
      expect(authService.changePassword).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual(expectedResult);
    });
  });

  // ==================== ADMIN ROUTES TESTS ====================
  // These endpoints require JWT authentication AND Admin role

  describe('createAdmin', () => {
    it('should call authService.createAdmin with DTO and creator ID', async () => {
      // Arrange: Mock register DTO and admin creator ID
      const dto: RegisterDto = { email: 'admin@example.com', name: 'New Admin', password: 'Admin123!@#' };
      const creatorId = 'admin-id';
      const expectedResult = { message: 'Admin created successfully', user: dto };
      mockAuthService.createAdmin.mockResolvedValue(expectedResult);

      // Act: Call create admin endpoint
      const result = await controller.createAdmin(dto, creatorId);

      // Assert: Verify service called with DTO and creator ID
      expect(authService.createAdmin).toHaveBeenCalledWith(dto, creatorId);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('getAllUsers', () => {
    it('should return paginated users list with default values', async () => {
      // Arrange: Mock paginated result with default pagination
      const expectedResult = {
        users: [{ id: '1', email: 'user@example.com' }],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      };
      mockAuthService.getAllUsers.mockResolvedValue(expectedResult);

      // Act: Call get all users with undefined values (defaults applied)
      const result = await controller.getAllUsers(undefined, undefined);

      // Assert: Verify service called with default pagination (page=1, limit=10)
      expect(authService.getAllUsers).toHaveBeenCalledWith(1, 10);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('getUserById', () => {
    it('should return user by ID', async () => {
      // Arrange: Mock user ID and expected user data
      const userId = 'user-id';
      const expectedUser = { id: userId, email: 'test@example.com', name: 'Test User' };
      mockAuthService.getUserById.mockResolvedValue(expectedUser);

      // Act: Call get user by ID endpoint
      const result = await controller.getUserById(userId);

      // Assert: Verify service called with user ID
      expect(authService.getUserById).toHaveBeenCalledWith(userId);
      expect(result).toEqual(expectedUser);
    });
  });

  describe('updateUserStatus', () => {
    it('should update user status', async () => {
      // Arrange: Mock user ID and new status
      const userId = 'user-id';
      const status = 'active';
      const expectedResult = { message: 'User status updated to active' };
      mockAuthService.updateUserStatus.mockResolvedValue(expectedResult);

      // Act: Call update user status endpoint
      const result = await controller.updateUserStatus(userId, status);

      // Assert: Verify service called with user ID and status
      expect(authService.updateUserStatus).toHaveBeenCalledWith(userId, status);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('deleteUser', () => {
    it('should delete user by ID', async () => {
      // Arrange: Mock user ID to delete and admin request
      const userId = 'user-to-delete-id';
      const expectedResult = { message: 'User account deleted successfully' };
      mockAuthService.deleteUser.mockResolvedValue(expectedResult);

      // Act: Call delete user endpoint with admin request
      const result = await controller.deleteUser(userId, mockRequestWithUser as any);

      // Assert: Verify service called with user ID and admin ID from request
      expect(authService.deleteUser).toHaveBeenCalledWith(userId, 'admin-id');
      expect(result).toEqual(expectedResult);
    });
  });

  // ==================== OTP ROUTES TESTS ====================
  // Passwordless authentication endpoints

  describe('requestOtp', () => {
    it('should call authService.sendOtp with email from DTO', async () => {
      // Arrange: Create OTP request DTO with email
      const dto: RequestOtpDto = { email: 'test@example.com' };
      const expectedResult = { message: 'OTP sent to email' };
      mockAuthService.sendOtp.mockResolvedValue(expectedResult);

      // Act: Call request OTP endpoint
      const result = await controller.requestOtp(dto);

      // Assert: Verify service called with email from DTO
      expect(authService.sendOtp).toHaveBeenCalledWith(dto.email);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('verifyOtp', () => {
    it('should call authService.verifyOtpAndLogin with DTO, IP, and User-Agent', async () => {
      // Arrange: Create OTP verification DTO and request data
      const dto: VerifyOtpDto = { email: 'test@example.com', code: '123456' };
      const ip = '127.0.0.1';
      const userAgent = 'Mozilla/5.0';
      const expectedResult = {
        success: true,
        message: 'Identity confirmed and authenticated successfully.',
        accessToken: 'token',
        refreshToken: 'refresh',
        user: { email: dto.email }
      };
      mockAuthService.verifyOtpAndLogin.mockResolvedValue(expectedResult);

      // Act: Call verify OTP endpoint
      const result = await controller.verifyOtp(dto, ip, userAgent);

      // Assert: Verify service called with all parameters and returns expected response
      expect(authService.verifyOtpAndLogin).toHaveBeenCalledWith(dto.email, dto.code, ip, userAgent);
      expect(result).toEqual(expectedResult);
    });
  });
});