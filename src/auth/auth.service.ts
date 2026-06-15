import {
    Injectable,
    Inject,
    ConflictException,
    UnauthorizedException,
    BadRequestException,
    NotFoundException,
    Logger,
    forwardRef,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, LessThan, IsNull, Not } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { User, UserRole, AccountStatus } from './entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { PasswordReset } from './entities/password-reset.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import {
    UserRegisteredEvent,
    EmailVerifiedEvent,
    PasswordResetRequestedEvent,
    PasswordResetSuccessEvent,
    AccountLockedEvent,
    UserLoggedInEvent,
    OtpRequestedEvent
} from './events/auth-events.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { FileUploadService } from '../file-upload/file-upload.service';
import { OtpVerification } from './entities/otp-verification.entity';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);
    constructor(
        @InjectRepository(User)
        private usersRepository: Repository<User>,
        @InjectRepository(RefreshToken)
        private refreshTokensRepository: Repository<RefreshToken>,
        @InjectRepository(PasswordReset)
        private passwordResetsRepository: Repository<PasswordReset>,
        @InjectRepository(OtpVerification)
        private otpRepository: Repository<OtpVerification>,
        private jwtService: JwtService,
        private eventEmitter: EventEmitter2,
        // @Inject('FileUploadService') // Activate this line only for integration test
        private fileUploadService: FileUploadService,
        private configService: ConfigService
    ) { }

    private get saltRounds(): number {
        return this.configService.get<number>('appConfig.auth.bcryptSaltRounds') || 12;
    }

    // ==================== REGISTRATION ====================
    async register(registerDto: RegisterDto) {
        const existingUser = await this.usersRepository.findOne({
            where: { email: registerDto.email.toLowerCase() },
        });

        if (existingUser) {
            throw new ConflictException('User with this email already exists');
        }

        const hashedPassword = await bcrypt.hash(registerDto.password, this.saltRounds);

        const newUser = this.usersRepository.create({
            email: registerDto.email.toLowerCase(),
            name: registerDto.name,
            password: hashedPassword,
            role: UserRole.USER,
            status: AccountStatus.PENDING_VERIFICATION,
        });

        const savedUser = await this.usersRepository.save(newUser);

        const verificationToken = this.jwtService.sign(
            { userId: savedUser.id },
            {
                secret: this.configService.get<string>('appConfig.auth.jwtVerificationSecret'),
                expiresIn: '24h'
            }
        );

        await this.eventEmitter.emitAsync(
            UserRegisteredEvent.eventName,
            new UserRegisteredEvent(savedUser, verificationToken),
        );

        const { password, ...result } = savedUser;
        return {
            user: result,
            message: 'Registration successful. Please check your email for verification.',
        };
    }

    // ==================== EMAIL VERIFICATION ====================
    async verifyEmail(token: string) {
        let payload: any;
        const verificationSecret = this.configService.get<string>('appConfig.auth.jwtVerificationSecret');

        try {
            payload = this.jwtService.verify(token, { secret: verificationSecret });
        } catch (error) {
            throw new BadRequestException('Invalid or expired verification token');
        }

        const user = await this.usersRepository.findOne({
            where: { id: payload.userId },
        });

        if (!user) {
            throw new BadRequestException('Invalid verification token');
        }

        if (user.emailVerifiedAt) {
            throw new BadRequestException('Email already verified');
        }

        user.emailVerifiedAt = new Date();
        user.status = AccountStatus.ACTIVE;
        await this.usersRepository.save(user);

        // Dispatched safely outside of token parsing exceptions
        try {
            await this.eventEmitter.emitAsync(EmailVerifiedEvent.eventName, new EmailVerifiedEvent(user));
        } catch (eventError) {
            // Log locally so the core response doesn't crash if the notification worker stumbles
            // You can optionally inject NestJS Logger here to trace it cleanly
        }

        return { message: 'Email verified successfully' };
    }

    // ==================== LOGIN ====================
    async login(loginDto: LoginDto, ip: string, userAgent: string) {
        const user = await this.usersRepository.findOne({
            where: { email: loginDto.email.toLowerCase() },
            select: ['id', 'email', 'name', 'password', 'role', 'status', 'loginAttempts', 'lockedUntil', 'emailVerifiedAt', 'profilePicture'],
        });

        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }

        if (user.isLocked()) {
            throw new UnauthorizedException(`Account is locked until ${user.lockedUntil}`);
        }

        if (!user.isEmailVerified()) {
            throw new UnauthorizedException('Please verify your email before logging in');
        }

        if (user.status !== AccountStatus.ACTIVE) {
            throw new UnauthorizedException(`Account is ${user.status}. Please contact support.`);
        }

        // Guard against Google OAuth users attempting traditional login without a password
        if (!user.password) {
            throw new UnauthorizedException('This account uses Google Sign-In. Please log in with Google.');
        }

        const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);

        if (!isPasswordValid) {
            user.loginAttempts += 1;

            if (user.loginAttempts >= 5) {
                user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
                await this.usersRepository.save(user);

                await this.eventEmitter.emitAsync(AccountLockedEvent.eventName, new AccountLockedEvent(user, 'Too many failed login attempts'));

                throw new UnauthorizedException('Account locked due to too many failed attempts. Try again in 15 minutes.');
            }

            await this.usersRepository.save(user);
            throw new UnauthorizedException('Invalid credentials');
        }

        user.loginAttempts = 0;
        user.lockedUntil = null;
        user.lastLoginAt = new Date();
        user.lastLoginIp = ip;
        await this.usersRepository.save(user);

        const tokens = await this.generateTokens(user, userAgent, ip);

        await this.eventEmitter.emitAsync(UserLoggedInEvent.eventName, new UserLoggedInEvent(user, ip, userAgent));

        const { password, ...result } = user;
        return {
            user: {
                id: result.id,
                email: result.email,
                name: result.name,
                role: result.role,
                status: result.status,
                profilePicture: result.profilePicture, // Profile picture must be included
                createdAt: result.createdAt,
                lastLoginAt: result.lastLoginAt,
            },
            ...tokens,
        };
    }

    // ==================== VERIFY OTP AND LOGIN =====================
 
    async verifyOtpAndLogin(
        email: string,
        code: string,
        ip: string,
        userAgent: string
    ): Promise<{ accessToken: string; refreshToken: string; user: any }> {

        // 1. Using the existing verification logic to confirm and burn the OTP token
        await this.verifyOtp(email, code);

        // 2. Fetch the user profile from the database
        const user = await this.usersRepository.findOne({
            where: { email },
            select: ['id', 'email', 'name', 'role', 'status', 'profilePicture', 'createdAt', 'lastLoginAt'],
        });

        if (!user) {
            throw new NotFoundException('No active user account is registered under this email address.');
        }

        // 3. Check if the user is currently locked out before granting access
        if (user.lockedUntil && user.lockedUntil > new Date()) {
            throw new BadRequestException(
                `This account is temporarily locked. Please try again after ${user.lockedUntil.toLocaleString()}.`
            );
        }

        // 4. Generate production JWT payloads
        const tokens = await this.generateTokens(user, userAgent, ip);

        // 5. Emit a login event to track security audit logs synchronously with your listener architecture
        this.eventEmitter.emit(
            'user.logged_in',
            new UserLoggedInEvent(user, ip, userAgent)
        );

        // Return complete user data (same structure as login)
        const { password, ...userWithoutPassword } = user;

        return {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            user: {
                id: userWithoutPassword.id,
                email: userWithoutPassword.email,
                name: userWithoutPassword.name,
                role: userWithoutPassword.role,
                status: userWithoutPassword.status,
                profilePicture: userWithoutPassword.profilePicture,
                createdAt: userWithoutPassword.createdAt,
                lastLoginAt: userWithoutPassword.lastLoginAt,
            },
        };
    }

    // You may implement passwordless signup service (via otp) here later (If you want)
    
    // ============ Service to clean up expired OTPs from db ===============
    // It is notified on vercel.json file to perform the cron job(Cleanup otps every 12am)
    async purgeExpiredOtps(): Promise<void> {
        const result = await this.otpRepository.delete({
            expiresAt: LessThan(new Date()),
        });
        this.logger.log(`🧹 Database maintenance: Purged ${result.affected} expired OTP records.`);
    }

    // ==================== UPDATE PROFILE SYSTEM ====================
    async updateProfile(userId: string, updateProfileDto: UpdateProfileDto, file?: Express.Multer.File) {
        const user = await this.usersRepository.findOne({ where: { id: userId } });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        if (file) {
            const fileLog = await this.fileUploadService.uploadSingleFile(file, 'SuperAuth/profile_pictures');
            user.profilePicture = fileLog.url;
        }

        if (updateProfileDto.name) {
            user.name = updateProfileDto.name;
        }

        const updatedUser = await this.usersRepository.save(user);

        const { password, ...result } = updatedUser;
        return {
            message: 'Profile updated successfully',
            user: result,
        };
    }

    // ==================== TOKEN GENERATION ====================
    private async generateTokens(user: User, userAgent: string, ip: string) {
        const accessToken = this.jwtService.sign(
            {
                id: user.id,
                email: user.email,
                role: user.role,
            },
            {
                secret: this.configService.get<string>('appConfig.auth.jwtAccessSecret'),
                expiresIn: this.configService.get<string>('appConfig.auth.jwtAccessExpiry') as any,
            },
        );

        const refreshToken = uuidv4();
        const refreshTokenExpiry = new Date();
        refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + 7);

        const refreshTokenEntity = this.refreshTokensRepository.create({
            token: refreshToken,
            user,
            userId: user.id,
            expiresAt: refreshTokenExpiry,
            userAgent,
            ipAddress: ip,
        });

        await this.refreshTokensRepository.save(refreshTokenEntity);

        return {
            accessToken,
            refreshToken,
            expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m',
        };
    }

    // ==================== REFRESH TOKEN ====================
    async refreshToken(refreshToken: string) {
        const tokenEntity = await this.refreshTokensRepository.findOne({
            where: { token: refreshToken },
            relations: ['user'],
        });

        if (!tokenEntity) {
            throw new UnauthorizedException('Invalid refresh token');
        }

        if (!tokenEntity.isValid()) {
            tokenEntity.revokedAt = new Date();
            tokenEntity.revokedReason = 'Expired or revoked';
            await this.refreshTokensRepository.save(tokenEntity);
            throw new UnauthorizedException('Refresh token has expired');
        }

        tokenEntity.revokedAt = new Date();
        tokenEntity.revokedReason = 'Used for refresh';
        await this.refreshTokensRepository.save(tokenEntity);

        const newTokens = await this.generateTokens(
            tokenEntity.user,
            tokenEntity.userAgent,
            tokenEntity.ipAddress,
        );

        return newTokens;
    }

    // ==================== LOGOUT ====================
    async logout(userId: string, refreshToken?: string) {
        if (refreshToken) {
            await this.refreshTokensRepository.update(
                { token: refreshToken },
                { revokedAt: new Date(), revokedReason: 'User logout' },
            );
        } else {
            await this.refreshTokensRepository.update(
                { userId, revokedAt: IsNull() },
                { revokedAt: new Date(), revokedReason: 'User logout' },
            );
        }

        return { message: 'Logged out successfully' };
    }

    // ==================== FORGOT PASSWORD ====================
    async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
        const user = await this.usersRepository.findOne({
            where: { email: forgotPasswordDto.email.toLowerCase() },
        });

        if (!user) {
            return { message: 'A password reset link has been sent to your registered email' };
        }

        const existingReset = await this.passwordResetsRepository.findOne({
            where: {
                user: { id: user.id },
                isUsed: false,
                expiresAt: MoreThan(new Date()),
            },
        });

        if (existingReset) {
            existingReset.isUsed = true;
            await this.passwordResetsRepository.save(existingReset);
        }

        const resetToken = uuidv4();
        const resetExpiry = new Date();
        resetExpiry.setHours(resetExpiry.getHours() + 1);

        const passwordReset = this.passwordResetsRepository.create({
            token: resetToken,
            user,
            userId: user.id,
            expiresAt: resetExpiry,
        });

        await this.passwordResetsRepository.save(passwordReset);

        await this.eventEmitter.emitAsync(PasswordResetRequestedEvent.eventName, new PasswordResetRequestedEvent(user, resetToken));

        return { message: 'If an account exists, a password reset link has been sent' };
    }

    // ==================== RESET PASSWORD ====================
    // Payload
    // // Token attached to the link sent on forgot password email
    // {
    //     "token": "66ff10c2-fdef-46a4-b10a-e165c8603548",
    //     "newPassword": "Nsikan0!"
    // }
    async resetPassword(resetPasswordDto: ResetPasswordDto) {
        const passwordReset = await this.passwordResetsRepository.findOne({
            where: { token: resetPasswordDto.token, isUsed: false },
            relations: ['user'],
        });

        if (!passwordReset || !passwordReset.canBeUsed()) {
            throw new BadRequestException('Invalid or expired reset token');
        }

        const hashedPassword = await bcrypt.hash(resetPasswordDto.newPassword, this.saltRounds);

        passwordReset.user.password = hashedPassword;
        await this.usersRepository.save(passwordReset.user);

        passwordReset.isUsed = true;
        await this.passwordResetsRepository.save(passwordReset);

        await this.refreshTokensRepository.update(
            { userId: passwordReset.user.id, revokedAt: IsNull() },
            { revokedAt: new Date(), revokedReason: 'Password reset' },
        );

        await this.eventEmitter.emitAsync(PasswordResetSuccessEvent.eventName, new PasswordResetSuccessEvent(passwordReset.user));

        return { message: 'Password reset successful. Please login with your new password.' };
    }

    // ==================== CHANGE PASSWORD ====================
    async changePassword(userId: string, changePasswordDto: ChangePasswordDto, currentRefreshToken?: string) {
        const user = await this.usersRepository.findOne({
            where: { id: userId },
            select: ['id', 'password'],
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        // Blocks change-password requests for native social-auth profiles
        if (!user.password) {
            throw new BadRequestException('Accounts created with Google cannot change passwords here. Use forgot-password instead.');
        }

        const isPasswordValid = await bcrypt.compare(changePasswordDto.currentPassword, user.password);

        if (!isPasswordValid) {
            throw new UnauthorizedException('Current password is incorrect');
        }

        const hashedPassword = await bcrypt.hash(changePasswordDto.newPassword, this.saltRounds);

        user.password = hashedPassword;
        await this.usersRepository.save(user);

        await this.refreshTokensRepository.update(
            {
                userId,
                revokedAt: IsNull(),
                ...(currentRefreshToken && { token: Not(currentRefreshToken) })
            },
            {
                revokedAt: new Date(),
                revokedReason: 'Password changed'
            },
        );

        await this.eventEmitter.emitAsync(PasswordResetSuccessEvent.eventName, new PasswordResetSuccessEvent(user as any));

        return { message: 'Password changed successfully' };
    }

    // ==================== ADMIN: CREATE ADMIN ====================
    async createAdmin(registerDto: RegisterDto, creatorId: string) {
        const creator = await this.usersRepository.findOne({
            where: { id: creatorId },
        });

        if (!creator || creator.role !== UserRole.ADMIN) {
            throw new UnauthorizedException('Only admins can create admin accounts');
        }

        const existingUser = await this.usersRepository.findOne({
            where: { email: registerDto.email.toLowerCase() },
        });

        if (existingUser) {
            throw new ConflictException('User with this email already exists');
        }

        const hashedPassword = await bcrypt.hash(registerDto.password, this.saltRounds);

        const newAdmin = this.usersRepository.create({
            email: registerDto.email.toLowerCase(),
            name: registerDto.name,
            password: hashedPassword,
            role: UserRole.ADMIN,
            status: AccountStatus.ACTIVE,
            emailVerifiedAt: new Date(),
        });

        const savedAdmin = await this.usersRepository.save(newAdmin);

        const { password, ...result } = savedAdmin;
        return {
            user: result,
            message: 'Admin user created successfully',
        };
    }

    // ==================== GET ALL USERS (Admin only) ====================
    async getAllUsers(page: number = 1, limit: number = 10) {
        const skip = (page - 1) * limit;

        const [users, total] = await this.usersRepository.findAndCount({
            select: ['id', 'email', 'name', 'role', 'status', 'createdAt', 'lastLoginAt', 'profilePicture'],
            skip,
            take: limit,
            order: { createdAt: 'DESC' },
        });

        return {
            users,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    // ==================== GET USER BY ID ====================
    async getUserById(userId: string) {
        const user = await this.usersRepository.findOne({
            where: { id: userId },
            select: ['id', 'email', 'name', 'role', 'status', 'profilePicture', 'createdAt', 'lastLoginAt'],
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        return user;
    }

    // ==================== UPDATE USER STATUS (Admin only) ====================
    async updateUserStatus(userId: string, status: AccountStatus) {
        const user = await this.usersRepository.findOne({
            where: { id: userId },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        user.status = status;
        await this.usersRepository.save(user);

        return { message: `User status updated to ${status}` };
    }

    // ==================== UPDATE USER ROLE (Admin only) ====================
    async updateUserRole(userId: string, role: string, adminId: string): Promise<{ message: string; user: any }> {
        // Prevent admin from changing their own role
        if (userId === adminId) {
            throw new BadRequestException('You cannot change your own role');
        }

        const user = await this.usersRepository.findOne({
            where: { id: userId },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        // Validate role
        if (!Object.values(UserRole).includes(role as UserRole)) {
            throw new BadRequestException('Invalid role');
        }

        user.role = role as UserRole;
        const updatedUser = await this.usersRepository.save(user);

        const { password, ...result } = updatedUser;
        return {
            message: `User role updated to ${role} successfully`,
            user: result,
        };
    }

    // ============== ADMIN: DELETE ACCOUNT PLUS RELATED FILES =================
    async deleteUser(userId: string, adminId: string) {
        // Confirm the actor executing this route is an authenticated Admin
        const admin = await this.usersRepository.findOne({ where: { id: adminId } });
        if (!admin || admin.role !== UserRole.ADMIN) {
            throw new UnauthorizedException('Access denied: Admin privileges required');
        }

        // Prevent administrators from accidentally executing a self-delete routine
        if (userId === adminId) {
            throw new BadRequestException('Action denied: You cannot delete your own admin account');
        }

        // Fetch target user along with profile metrics
        const user = await this.usersRepository.findOne({
            where: { id: userId },
            select: ['id', 'profilePicture']
        });

        if (!user) {
            throw new NotFoundException('Target user account not found');
        }

        // Extract and safely purge profile picture from Cloudinary storage
        if (user.profilePicture) {
            await this.fileUploadService.deleteFileByUrl(user.profilePicture);
        }

        // Cascade delete user tokens and core identity row
        await this.refreshTokensRepository.delete({ userId });
        await this.passwordResetsRepository.delete({ userId });

        await this.usersRepository.remove(user);

        return { message: 'User account and associated media assets cleared successfully' };
    }

    // ================= SOCIAL LOGIN WITH GOOGLE =======================
    async validateSocialLogin(profile: any, ip: string, userAgent: string) {
        // 1. Check for existing user by email
        let user = await this.usersRepository.findOne({ where: { email: profile.email } });

        if (!user) {
            // 2. Register user automatically if their account doesn't exist
            user = this.usersRepository.create({
                email: profile.email,
                name: profile.name,
                provider: profile.provider,
                providerId: profile.providerId,
                status: AccountStatus.ACTIVE,
                emailVerifiedAt: new Date(), // Google emails are already verified
            });
            user = await this.usersRepository.save(user);
        } else {
            // 3. If they exist but registered via credentials, link their social account data
            if (!user.provider) {
                user.provider = profile.provider;
                user.providerId = profile.providerId;
                await this.usersRepository.save(user);
            }
        }

        // 4. Reuse token generation logic
        const tokens = await this.generateTokens(user, userAgent, ip);

        // Same as login
        const { password, ...userWithoutPassword } = user;

        return {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            user: {
                id: userWithoutPassword.id,
                email: userWithoutPassword.email,
                name: userWithoutPassword.name,
                role: userWithoutPassword.role,
                status: userWithoutPassword.status,
                profilePicture: userWithoutPassword.profilePicture,
                provider: userWithoutPassword.provider,
            },
        };
    }

    // ======================== OTP CODE =========================
    // 1. GENERATE AND SEND OTP
    async sendOtp(email: string): Promise<{ message: string }> {
        // 1. Implicit Invalidation: Deactivate any active, unused OTPs for this email first before sending a new one
        await this.otpRepository.update(
            { email, isUsed: false },
            { isUsed: true }
        );

        // 2. Generate the raw, plain text 6-digit numeric string
        const rawOtpCode = crypto.randomInt(100000, 999999).toString();

        // 3. Hash the raw code using SHA-256 before saving to the database
        const hashedOtpCode = crypto
            .createHash('sha256')
            .update(rawOtpCode)
            .digest('hex');

        // 4. Establish a 10-minute expiration window
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 10);

        // 5. Commit the hashed value to your database
        const newOtp = this.otpRepository.create({
            email,
            code: hashedOtpCode, // Storage is now fully secured
            expiresAt,
        });
        await this.otpRepository.save(newOtp);

        // 6. EMIT THE OTP EVENT ASYNCHRONOUSLY
        // This helps in freeing up Vercel execution context thread!
        await this.eventEmitter.emitAsync(
            OtpRequestedEvent.eventName,
            new OtpRequestedEvent(email, rawOtpCode) // Passing raw code so email can send it
        );

        // Temporary console log for development tracking
        console.log(`📡 [OTP Debug Engine] Code for ${email}: ${rawOtpCode}`);

        return {
            message: 'A verification code has been dispatched to your email address.'
        };
    }

    async verifyOtp(email: string, rawCodeSubmitted: string): Promise<boolean> {
        // 1. Hash the incoming code using the identical SHA-256 algorithm setup
        const hashedSubmission = crypto
            .createHash('sha256')
            .update(rawCodeSubmitted)
            .digest('hex');

        // 2. Query using the generated hash signature
        const otpRecord = await this.otpRepository.findOne({
            where: {
                email,
                code: hashedSubmission, // Match against your hashed database value
                isUsed: false,
                expiresAt: MoreThan(new Date()), // Guardrail window check
            },
        });

        if (!otpRecord) {
            throw new BadRequestException('The verification code is invalid or has expired.');
        }

        // 3. Burn the token instantly to block re-play exploitation vectors
        otpRecord.isUsed = true;
        await this.otpRepository.save(otpRecord);

        return true;
    }

}










