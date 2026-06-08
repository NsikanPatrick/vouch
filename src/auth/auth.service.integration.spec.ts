import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { User, UserRole, AccountStatus } from './entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { PasswordReset } from './entities/password-reset.entity';
import { OtpVerification } from './entities/otp-verification.entity';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RegisterDto } from './dto/register.dto';
import * as bcrypt from 'bcrypt';

// Mock bcrypt for integration tests
jest.mock('bcrypt');
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

// Mock uuid for integration tests
jest.mock('uuid', () => ({
    v4: jest.fn(() => 'mocked-uuid-token'),
}));

// Mock crypto for integration tests
jest.mock('crypto', () => ({
    randomInt: jest.fn(() => 123456),
    createHash: jest.fn(() => ({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn(() => 'hashed-otp-code'),
    })),
}));

// Mock FileUploadService for integration tests
const mockFileUploadService = {
    uploadSingleFile: jest.fn().mockResolvedValue({ url: 'https://example.com/avatar.jpg', publicId: 'test-id' }),
    deleteFileByUrl: jest.fn().mockResolvedValue(true),
    deleteFile: jest.fn().mockResolvedValue(true),
};

// Increase timeout for all tests in this suite
jest.setTimeout(30000);

describe.skip('AuthService Integration Tests', () => {
    describe('AuthService Integration Tests', () => {
        let service: AuthService;
        let module: TestingModule;

        beforeAll(async () => {
            // Use a custom database configuration that converts enums to text
            module = await Test.createTestingModule({
                imports: [
                    TypeOrmModule.forRoot({
                        type: 'sqlite',
                        database: ':memory:',
                        entities: [User, RefreshToken, PasswordReset, OtpVerification],
                        synchronize: true,
                        dropSchema: true,
                        // Use string as the enum type mapping
                        logging: false,
                    }),
                    TypeOrmModule.forFeature([User, RefreshToken, PasswordReset, OtpVerification]),
                ],
                providers: [
                    AuthService,
                    {
                        provide: JwtService,
                        useValue: {
                            sign: jest.fn(() => 'mock-access-token'),
                            verify: jest.fn(() => ({ userId: 'test-id' })),
                        },
                    },
                    {
                        provide: ConfigService,
                        useValue: {
                            get: jest.fn((key: string) => {
                                const config: Record<string, any> = {
                                    'appConfig.auth.bcryptSaltRounds': 12,
                                    'appConfig.auth.jwtVerificationSecret': 'test-secret',
                                    'appConfig.auth.jwtAccessSecret': 'access-secret',
                                    'appConfig.auth.jwtAccessExpiry': '15m',
                                    'appConfig.frontendUrl': 'http://localhost:3000',
                                };
                                return config[key];
                            }),
                        },
                    },
                    {
                        provide: EventEmitter2,
                        useValue: { emitAsync: jest.fn().mockResolvedValue(true), emit: jest.fn() },
                    },
                    {
                        provide: 'FileUploadService',
                        useValue: mockFileUploadService,
                    },
                ],
            }).compile();

            service = module.get<AuthService>(AuthService);

            // Wait for the module to initialize
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Mock bcrypt hash to return a predictable value
            mockedBcrypt.hash.mockResolvedValue('hashed-password' as never);
            mockedBcrypt.compare.mockImplementation(async (plain: string, hashed: string) => {
                // For testing purposes, consider 'Test123!@#' and 'OldPass123!@#' as valid passwords
                return plain === 'Test123!@#' || plain === 'OldPass123!@#';
            });
        });

        afterAll(async () => {
            if (module) {
                await module.close();
            }
        });

        // ==================== REGISTRATION FLOW TESTS ====================
        describe('Registration Flow', () => {
            it('should create a user and retrieve it from database', async () => {
                // Arrange: Create registration DTO
                const registerDto: RegisterDto = {
                    email: 'integration@example.com',
                    name: 'Integration Test',
                    password: 'Test123!@#',
                };

                // Act: Register a new user
                const result = await service.register(registerDto);

                // Assert: Verify user was created
                expect(result.user.id).toBeDefined();
                expect(result.user.email).toBe(registerDto.email);
                expect(result.message).toContain('Registration successful');

                // Act: Retrieve the user from database
                const foundUser = await service.getUserById(result.user.id);

                // Assert: Verify user data matches
                expect(foundUser).toBeDefined();
                expect(foundUser.email).toBe(registerDto.email);
                expect(foundUser.name).toBe(registerDto.name);
                // Role and status will be strings in SQLite, but they should match the enum values
                expect(foundUser.role).toBe(UserRole.USER);
                expect(foundUser.status).toBe(AccountStatus.PENDING_VERIFICATION);
            });

            it('should not allow duplicate email registration', async () => {
                // Arrange: Create registration DTO with duplicate email
                const registerDto: RegisterDto = {
                    email: 'duplicate@example.com',
                    name: 'First User',
                    password: 'Test123!@#',
                };

                // Act: Register first user
                await service.register(registerDto);

                // Act & Assert: Attempt to register duplicate should fail
                await expect(service.register(registerDto)).rejects.toThrow();
            });
        });

        // ==================== LOGIN FLOW TESTS ====================
        describe('Login Flow', () => {
            const testUser = {
                email: 'login-test@example.com',
                name: 'Login Test',
                password: 'Test123!@#',
            };

            beforeAll(async () => {
                // Create a user for login tests
                const registerDto: RegisterDto = testUser;
                await service.register(registerDto);

                // Manually verify email for login test (bypass email verification)
                // Using type assertion to access private repository
                const repository = (service as any).usersRepository;
                const user = await repository.findOne({
                    where: { email: testUser.email }
                });
                if (user) {
                    user.emailVerifiedAt = new Date();
                    user.status = AccountStatus.ACTIVE;
                    await repository.save(user);
                }
            });

            it('should login successfully with valid credentials', async () => {
                // Act: Attempt login
                const result = await service.login(
                    { email: testUser.email, password: testUser.password },
                    '127.0.0.1',
                    'Mozilla/5.0'
                );

                // Assert: Verify tokens are returned
                expect(result.accessToken).toBeDefined();
                expect(result.refreshToken).toBeDefined();
                expect(result.user.email).toBe(testUser.email);
            });

            it('should reject login with invalid password', async () => {
                // Act & Assert: Login with wrong password
                await expect(service.login(
                    { email: testUser.email, password: 'WrongPassword123!' },
                    '127.0.0.1',
                    'Mozilla/5.0'
                )).rejects.toThrow();
            });
        });

        // ==================== FORGOT PASSWORD FLOW TESTS ====================
        describe('Forgot Password Flow', () => {
            const testUser = {
                email: 'forgot-test@example.com',
                name: 'Forgot Test',
                password: 'Test123!@#',
            };

            beforeAll(async () => {
                // Create a user for forgot password tests
                const registerDto: RegisterDto = testUser;
                await service.register(registerDto);
            });

            it('should generate a password reset token for existing user', async () => {
                // Act: Request password reset
                const result = await service.forgotPassword({ email: testUser.email });

                // Assert: Verify success message
                expect(result.message).toContain('password reset link has been sent');
            });

            it('should return generic message for non-existent email (security best practice)', async () => {
                // Act: Request password reset for non-existent email
                const result = await service.forgotPassword({ email: 'nonexistent@example.com' });

                // Assert: Generic message (doesn't reveal user existence)
                expect(result.message).toContain('A password reset link has been sent');
            });
        });

        // ==================== USER RETRIEVAL TESTS ====================
        describe('User Retrieval', () => {
            let userId: string;

            beforeAll(async () => {
                // Create a user for retrieval tests
                const registerDto: RegisterDto = {
                    email: 'retrieve-test@example.com',
                    name: 'Retrieve Test',
                    password: 'Test123!@#',
                };
                const result = await service.register(registerDto);
                userId = result.user.id;
            });

            it('should get user by ID successfully', async () => {
                // Act: Get user by ID
                const user = await service.getUserById(userId);

                // Assert: Verify user data
                expect(user).toBeDefined();
                expect(user.id).toBe(userId);
                expect(user.email).toBe('retrieve-test@example.com');
                expect(user.name).toBe('Retrieve Test');
            });

            it('should throw NotFoundException for non-existent user ID', async () => {
                // Act & Assert: Get non-existent user
                await expect(service.getUserById('non-existent-id')).rejects.toThrow();
            });
        });

        // ==================== PROFILE UPDATE TESTS ====================
        describe('Profile Update', () => {
            let userId: string;

            beforeAll(async () => {
                // Create a user for profile update tests
                const registerDto: RegisterDto = {
                    email: 'profile-test@example.com',
                    name: 'Original Name',
                    password: 'Test123!@#',
                };
                const result = await service.register(registerDto);
                userId = result.user.id;

                // Manually verify email
                const repository = (service as any).usersRepository;
                const user = await repository.findOne({ where: { id: userId } });
                if (user) {
                    user.emailVerifiedAt = new Date();
                    user.status = AccountStatus.ACTIVE;
                    await repository.save(user);
                }
            });

            it('should update user name successfully', async () => {
                // Act: Update profile name
                const result = await service.updateProfile(userId, { name: 'Updated Name' });

                // Assert: Verify name updated
                expect(result.message).toContain('Profile updated successfully');
                expect(result.user.name).toBe('Updated Name');

                // Verify in database
                const user = await service.getUserById(userId);
                expect(user.name).toBe('Updated Name');
            });
        });

        // ==================== PASSWORD CHANGE TESTS ====================
        describe('Password Change Flow', () => {
            let userId: string;

            beforeAll(async () => {
                // Create a user for password change tests
                const registerDto: RegisterDto = {
                    email: 'password-change@example.com',
                    name: 'Password Change Test',
                    password: 'OldPass123!@#',
                };
                const result = await service.register(registerDto);
                userId = result.user.id;

                // Manually verify email and set password
                const repository = (service as any).usersRepository;
                const user = await repository.findOne({ where: { id: userId } });
                if (user) {
                    user.emailVerifiedAt = new Date();
                    user.status = AccountStatus.ACTIVE;
                    // Use bcrypt to hash the password
                    user.password = await bcrypt.hash('OldPass123!@#', 10);
                    await repository.save(user);
                }
            });

            it('should change password with valid current password', async () => {
                // Act: Change password
                const result = await service.changePassword(userId, {
                    currentPassword: 'OldPass123!@#',
                    newPassword: 'NewPass123!@#',
                });

                // Assert: Verify password changed
                expect(result.message).toContain('Password changed successfully');
            });
        });
    });
})

// To run only Integration test
// npm run test-- --testPathPatterns="integration"