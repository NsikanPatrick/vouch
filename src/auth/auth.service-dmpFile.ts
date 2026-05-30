import {
    Injectable,
    ConflictException,
    UnauthorizedException,
    BadRequestException,
    NotFoundException,
    Inject,
    forwardRef,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, IsNull, Not } from 'typeorm';
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
} from './events/auth-events.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { FileUploadService } from '../file-upload/file-upload.service';

@Injectable()
export class AuthService {
    constructor(
        @InjectRepository(User)
        private usersRepository: Repository<User>,
        @InjectRepository(RefreshToken)
        private refreshTokensRepository: Repository<RefreshToken>,
        @InjectRepository(PasswordReset)
        private passwordResetsRepository: Repository<PasswordReset>,
        private jwtService: JwtService,
        private eventEmitter: EventEmitter2,
        private fileUploadService: FileUploadService,
        private configService: ConfigService // Will extract details from app.config.ts
    ) { }

    // ==================== REGISTRATION ====================
    async register(registerDto: RegisterDto) {
        // Check if user exists
        const existingUser = await this.usersRepository.findOne({
            where: { email: registerDto.email.toLowerCase() },
        });

        if (existingUser) {
            throw new ConflictException('User with this email already exists');
        }

        // Hash password
        const saltRounds = this.configService.get<number>('appConfig.auth.bcryptSaltRounds') || 12;
        const hashedPassword = await bcrypt.hash(registerDto.password, saltRounds);
        // const hashedPassword = await bcrypt.hash(registerDto.password, 12);


        // Create verification token
        // const verificationToken = uuidv4();

        // Create new user
        const newUser = this.usersRepository.create({
            email: registerDto.email.toLowerCase(),
            name: registerDto.name,
            password: hashedPassword,
            role: UserRole.USER,
            status: AccountStatus.PENDING_VERIFICATION,
        });

        const savedUser = await this.usersRepository.save(newUser);

        // Create verification token
        // Emit event for email sending (now carrying a valid JWT string)
        const verificationToken = this.jwtService.sign(
            { userId: savedUser.id },
            {
                secret: this.configService.get<string>('appConfig.auth.jwtVerificationSecret'), // 👈 Matches your verifyEmail secret key
                expiresIn: '24h'
            }
        );

        // Emit event for email sending (handled by listener)
        await this.eventEmitter.emitAsync(
            // 'user.registered',
            UserRegisteredEvent.eventName, //The eventName is defnd in the event.service file
            new UserRegisteredEvent(savedUser, verificationToken),
        );

        // Return user without password
        const { password, ...result } = savedUser;
        return {
            user: result,
            message: 'Registration successful. Please check your email for verification.',
        };
    }

    // ==================== EMAIL VERIFICATION ====================
    async verifyEmail(token: string) {
        // In production, you'd store verification tokens in a separate table
        // For simplicity, we'll use a JWT token or store in cache

        // This is a simplified version - in production, implement proper token storage
        // We'll use a JWT token for email verification
        try {
            const verificationSecret = this.configService.get<string>('appConfig.auth.jwtVerificationSecret');
            const payload = this.jwtService.verify(token, { secret: verificationSecret });

            const user = await this.usersRepository.findOne({
                where: { id: payload.userId },
            });

            if (!user) {
                throw new BadRequestException('Invalid verification token');
            }

            if (user.emailVerifiedAt) {
                throw new BadRequestException('Email already verified');
            }

            // Update user
            user.emailVerifiedAt = new Date();
            user.status = AccountStatus.ACTIVE;
            await this.usersRepository.save(user);

            // Emit event
            // this.eventEmitter.emit('email.verified', new EmailVerifiedEvent(user));
            await this.eventEmitter.emitAsync(EmailVerifiedEvent.eventName, new EmailVerifiedEvent(user));

            return { message: 'Email verified successfully' };
        } catch (error) {
            throw new BadRequestException('Invalid or expired verification token');
        }
    }

    // ==================== LOGIN ====================
    async login(loginDto: LoginDto, ip: string, userAgent: string) {
        const user = await this.usersRepository.findOne({
            where: { email: loginDto.email.toLowerCase() },
            select: ['id', 'email', 'name', 'password', 'role', 'status', 'loginAttempts', 'lockedUntil', 'emailVerifiedAt'],
        });

        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }

        // Check if account is locked
        if (user.isLocked()) {
            throw new UnauthorizedException(`Account is locked until ${user.lockedUntil}`);
        }

        // Check if email is verified
        if (!user.isEmailVerified()) {
            throw new UnauthorizedException('Please verify your email before logging in');
        }

        // Check if account is active
        if (user.status !== AccountStatus.ACTIVE) {
            throw new UnauthorizedException(`Account is ${user.status}. Please contact support.`);
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);

        if (!isPasswordValid) {
            // Increment login attempts
            user.loginAttempts += 1;

            // Lock account after 5 failed attempts
            if (user.loginAttempts >= 5) {
                user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // Lock for 15 minutes
                await this.usersRepository.save(user);

                // Emit account locked event
                // this.eventEmitter.emit('account.locked', new AccountLockedEvent(user, 'Too many failed login attempts'));
                await this.eventEmitter.emitAsync(AccountLockedEvent.eventName, new AccountLockedEvent(user, 'Too many failed login attempts'));

                throw new UnauthorizedException('Account locked due to too many failed attempts. Try again in 15 minutes.');
            }

            await this.usersRepository.save(user);
            throw new UnauthorizedException('Invalid credentials');
        }

        // Reset login attempts on successful login
        user.loginAttempts = 0;
        user.lockedUntil = null;
        user.lastLoginAt = new Date();
        user.lastLoginIp = ip;
        await this.usersRepository.save(user);

        // Generate tokens
        const tokens = await this.generateTokens(user, userAgent, ip);

        // Emit login event
        // this.eventEmitter.emit('user.logged_in', new UserLoggedInEvent(user, ip, userAgent));
        await this.eventEmitter.emitAsync(UserLoggedInEvent.eventName, new UserLoggedInEvent(user, ip, userAgent));

        // Return user without password
        const { password, ...result } = user;
        return {
            user: result,
            ...tokens,
        };
    }

    // ==================== UPDATE PROFILE SYSTEM ====================
    async updateProfile(userId: string, updateProfileDto: UpdateProfileDto, file?: Express.Multer.File) {
        const user = await this.usersRepository.findOne({ where: { id: userId } });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        // 1. Process profile image if uploaded
        if (file) {
            // Forward processing straight to our file upload service unit!
            const fileLog = await this.fileUploadService.uploadSingleFile(file, 'SuperAuth/profile_pictures');
            user.profilePicture = fileLog.url; // Assign the saved secure cloud URL
        }

        // 2. Process text payload mutations
        if (updateProfileDto.name) {
            user.name = updateProfileDto.name;
        }

        const updatedUser = await this.usersRepository.save(user);

        // Strip hash out of response maps
        const { password, ...result } = updatedUser;
        return {
            message: 'Profile updated successfully',
            user: result,
        };
    }

    // ==================== TOKEN GENERATION ====================
    // Private helper function
    private async generateTokens(user: User, userAgent: string, ip: string) {
        // Generate access token
        const accessToken = this.jwtService.sign(
            {
                id: user.id,
                email: user.email,
                role: user.role,
            },
            {
                // The ones commented out and the ones used are the same, done in diff ways
                secret: this.configService.get<string>('appConfig.auth.jwtAccessSecret'),
                expiresIn: this.configService.get<string>('appConfig.auth.jwtAccessExpiry') as any,
                // secret: process.env.JWT_ACCESS_SECRET,
                // expiresIn: (process.env.JWT_ACCESS_EXPIRY || '15m') as any,
            },
        );

        // Generate refresh token
        const refreshToken = uuidv4();
        const refreshTokenExpiry = new Date();
        refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + 7); // 7 days

        // Save refresh token to database
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
    // All async methods follow the default visibility - public
    async refreshToken(refreshToken: string) {
        // Find refresh token in database
        const tokenEntity = await this.refreshTokensRepository.findOne({
            where: { token: refreshToken },
            relations: ['user'],
        });

        if (!tokenEntity) {
            throw new UnauthorizedException('Invalid refresh token');
        }

        // Check if token is valid
        if (!tokenEntity.isValid()) {
            // Revoke the invalid token
            tokenEntity.revokedAt = new Date();
            tokenEntity.revokedReason = 'Expired or revoked';
            await this.refreshTokensRepository.save(tokenEntity);
            throw new UnauthorizedException('Refresh token has expired');
        }

        // Revoke old token (one-time use)
        tokenEntity.revokedAt = new Date();
        tokenEntity.revokedReason = 'Used for refresh';
        await this.refreshTokensRepository.save(tokenEntity);

        // Generate new tokens
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
            // Revoke specific refresh token
            await this.refreshTokensRepository.update(
                { token: refreshToken },
                { revokedAt: new Date(), revokedReason: 'User logout' },
            );
        } else {
            // Revoke all refresh tokens for user
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

        // For security, always return success even if user doesn't exist
        if (!user) {
            return { message: 'A password reset link has been sent to your registered email' };
        }

        // Check if there's already a valid reset token
        const existingReset = await this.passwordResetsRepository.findOne({
            where: {
                user: { id: user.id },
                isUsed: false,
                expiresAt: MoreThan(new Date()),
            },
        });

        if (existingReset) {
            // Revoke existing token
            existingReset.isUsed = true;
            await this.passwordResetsRepository.save(existingReset);
        }

        // Generate reset token
        const resetToken = uuidv4();
        const resetExpiry = new Date();
        resetExpiry.setHours(resetExpiry.getHours() + 1); // 1 hour expiry

        // Save reset token
        const passwordReset = this.passwordResetsRepository.create({
            token: resetToken,
            user,
            userId: user.id,
            expiresAt: resetExpiry,
        });

        await this.passwordResetsRepository.save(passwordReset);

        // Emit event for email sending
        // this.eventEmitter.emit('password.reset.requested', new PasswordResetRequestedEvent(user, resetToken));
        await this.eventEmitter.emitAsync(PasswordResetRequestedEvent.eventName, new PasswordResetRequestedEvent(user, resetToken));

        return { message: 'If an account exists, a password reset link has been sent' };
    }

    // ==================== RESET PASSWORD ====================
    async resetPassword(resetPasswordDto: ResetPasswordDto) {
        // Find valid reset token
        const passwordReset = await this.passwordResetsRepository.findOne({
            where: { token: resetPasswordDto.token, isUsed: false },
            relations: ['user'],
        });

        if (!passwordReset || !passwordReset.canBeUsed()) {
            throw new BadRequestException('Invalid or expired reset token');
        }

        // Hash new password
        const saltRounds = this.configService.get<number>('appConfig.auth.bcryptSaltRounds') || 12;
        const hashedPassword = await bcrypt.hash(resetPasswordDto.newPassword, saltRounds);

        // Update user's password
        passwordReset.user.password = hashedPassword;
        await this.usersRepository.save(passwordReset.user);

        // Mark token as used
        passwordReset.isUsed = true;
        await this.passwordResetsRepository.save(passwordReset);

        // Revoke all refresh tokens for security
        await this.refreshTokensRepository.update(
            { userId: passwordReset.user.id, revokedAt: IsNull() },
            { revokedAt: new Date(), revokedReason: 'Password reset' },
        );

        // Emit event
        // this.eventEmitter.emit('password.reset.success', new PasswordResetSuccessEvent(passwordReset.user));
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

        // Verify current password
        const isPasswordValid = await bcrypt.compare(changePasswordDto.currentPassword, user.password);

        if (!isPasswordValid) {
            throw new UnauthorizedException('Current password is incorrect');
        }

        // Hash new password
        const saltRounds = this.configService.get<number>('appConfig.auth.bcryptSaltRounds') || 12;
        const hashedPassword = await bcrypt.hash(changePasswordDto.newPassword, saltRounds);

        // Update password
        user.password = hashedPassword;
        await this.usersRepository.save(user);

        // Revoke all refresh tokens except the current session
        await this.refreshTokensRepository.update(
            {
                userId,
                revokedAt: IsNull(),
                ...(currentRefreshToken && { token: Not(currentRefreshToken) }) // Protects current session if provided
            },
            {
                revokedAt: new Date(),
                revokedReason: 'Password changed'
            },
        );

        // Send notification email (handled by event)
        // this.eventEmitter.emit('password.reset.success', new PasswordResetSuccessEvent(user as any));
        await this.eventEmitter.emitAsync(PasswordResetSuccessEvent.eventName, new PasswordResetSuccessEvent(user as any));

        return { message: 'Password changed successfully' };
    }

    // ==================== ADMIN: CREATE ADMIN ====================
    async createAdmin(registerDto: RegisterDto, creatorId: string) {
        // Check if creator is admin (this should be checked by guard, but double-check)
        const creator = await this.usersRepository.findOne({
            where: { id: creatorId },
        });

        if (!creator || creator.role !== UserRole.ADMIN) {
            throw new UnauthorizedException('Only admins can create admin accounts');
        }

        // Check if user exists
        const existingUser = await this.usersRepository.findOne({
            where: { email: registerDto.email.toLowerCase() },
        });

        if (existingUser) {
            throw new ConflictException('User with this email already exists');
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(registerDto.password, 12);

        // Create admin user
        const newAdmin = this.usersRepository.create({
            email: registerDto.email.toLowerCase(),
            name: registerDto.name,
            password: hashedPassword,
            role: UserRole.ADMIN,
            status: AccountStatus.ACTIVE,
            emailVerifiedAt: new Date(), // Auto-verify admin emails
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
            select: ['id', 'email', 'name', 'role', 'status', 'createdAt', 'lastLoginAt'],
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
}