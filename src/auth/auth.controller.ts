import {
    Controller,
    Post,
    Body,
    Get,
    UseGuards,
    BadRequestException,
    Request,
    Ip,
    Headers,
    Patch,
    Delete,
    Query,
    Param,
    UseInterceptors, UploadedFile
} from '@nestjs/common';
import { AuthService } from './auth.service-dmpFile';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from './entities/user.entity';
import { RolesGuard } from '../common/guards/roles.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { UpdateProfileDto } from './dto/update-profile.dto';


@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) { }

    // Public routes (no authentication required)
    @Public()
    @Post('register')
    register(@Body() registerDto: RegisterDto) {
        return this.authService.register(registerDto);
    }

    @Public()
    @Post('verify-email')
    verifyEmail(@Body('token') token: string) {
        return this.authService.verifyEmail(token);
    }

    // TEMPORARY TESTING ROUTE (Without having to write a verification email landing page)
    @Public() // Must be public so the link can be clicked without a login token!
    @Get('verify-email-test')
    async verifyEmailTest(@Query('token') token: string) {
        if (!token) {
            throw new BadRequestException('Token is missing from the link');
        }

        try {
            // We pass the token directly to the exact same service logic your POST route uses!
            await this.authService.verifyEmail(token);

            // Return a simple success page directly to the browser screen
            return `
                <div style="font-family: Arial, sans-serif; text-align: center; margin-top: 100px;">
                    <div style="font-size: 50px;">✅</div>
                    <h1 style="color: #2e7d32; margin-top: 10px;">Email Verified Successfully!</h1>
                    <p style="color: #555; font-size: 16px;">Your account is now active. You can close this tab and log in via Postman.</p>
                </div>
            `;
        } catch (error) {
            // Return a clean error page if the token is invalid or expired
            return `
                <div style="font-family: Arial, sans-serif; text-align: center; margin-top: 100px;">
                    <div style="font-size: 50px;">❌</div>
                    <h1 style="color: #c62828; margin-top: 10px;">Verification Failed</h1>
                    <p style="color: #555; font-size: 16px;">${error.message || 'The token is invalid or has expired.'}</p>
                </div>
            `;
        }
    }

    @Public()
    @Post('login')
    login(
        @Body() loginDto: LoginDto,
        @Ip() ip: string,
        @Headers('user-agent') userAgent: string,
    ) {
        return this.authService.login(loginDto, ip, userAgent);
    }

    @Public()
    @Post('refresh-token')
    refreshToken(@Body('refreshToken') refreshToken: string) {
        return this.authService.refreshToken(refreshToken);
    }

    // Forgot password and reset password are on the same flow, this is different from change-password
    @Public()
    @Post('forgot-password')
    forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
        return this.authService.forgotPassword(forgotPasswordDto);
    }

    @Public()
    @Post('reset-password')
    resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
        return this.authService.resetPassword(resetPasswordDto);
    }

    // TEMPORARY TESTING ROUTE (Allows password reset directly from the email link via a browser form)
    // This is the part of the password (sent to email), that'll trap new password from the browser form
    @Public()
    @Get('reset-password-test')
    async resetPasswordTest(@Query('token') token: string) {
        if (!token) {
            throw new BadRequestException('Reset token is missing from the link');
        }

        // Return a clean HTML form directly to the browser screen
        return `
            <div style="font-family: Arial, sans-serif; max-width: 400px; margin: 100px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                <h2 style="color: #333; text-align: center; margin-bottom: 20px;">Reset Your Password</h2>
                <p style="color: #666; font-size: 14px; text-align: center; margin-bottom: 20px;">Enter your new password below to update your account access.</p>
                
                <form action="/api/v1/auth/reset-password" method="POST">
                    <input type="hidden" name="token" value="${token}" />
                    
                    <div style="margin-bottom: 15px;">
                        <label style="display: block; font-weight: bold; margin-bottom: 5px; font-size: 14px;">New Password</label>
                        <input type="password" name="newPassword" required placeholder="••••••••" 
                            style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;" />
                    </div>
                    
                    <button type="submit" 
                        style="width: 100%; background-color: #1a73e8; color: white; border: none; padding: 12px; border-radius: 4px; font-size: 16px; font-weight: bold; cursor: pointer; margin-top: 10px;">
                        Update Password
                    </button>
                </form>
            </div>
        `;
    }

    // Protected routes (authentication required)
    @UseGuards(JwtAuthGuard)
    @Post('logout')
    logout(@CurrentUser('id') userId: string, @Body('refreshToken') refreshToken?: string) {
        return this.authService.logout(userId, refreshToken);
    }

    // Fetch my profile
    @UseGuards(JwtAuthGuard)
    @Get('profile')
    getProfile(@CurrentUser() user: any) {
        return this.authService.getUserById(user.id);
    }

    // Update my profile
    @UseGuards(JwtAuthGuard)
    @Patch('profile')
    @UseInterceptors(FileInterceptor('profilePicture')) // Intercept multi-part form key named 'profilePicture'
    async updateProfile(
        @CurrentUser('id') userId: string,
        @Body() updateProfileDto: UpdateProfileDto,
        @UploadedFile() file?: Express.Multer.File,
    ) {
        // Interceptor validation guards
        if (file) {
            const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
            if (!allowedMimeTypes.includes(file.mimetype)) {
                throw new BadRequestException('Invalid format. Only JPEG, PNG, and WebP are allowed.');
            }
            if (file.size > 3 * 1024 * 1024) { // Guardrail cap validation at 3MB
                throw new BadRequestException('File size limit exceeded. Maximum upload size allowed is 3MB.');
            }
        }

        return this.authService.updateProfile(userId, updateProfileDto, file);
    }

    @UseGuards(JwtAuthGuard)
    @Patch('change-password')
    changePassword(@CurrentUser('id') userId: string, @Body() changePasswordDto: ChangePasswordDto) {
        return this.authService.changePassword(userId, changePasswordDto);
    }

    // Admin only routes
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN)
    @Post('create-admin')
    createAdmin(@Body() registerDto: RegisterDto, @CurrentUser('id') creatorId: string) {
        return this.authService.createAdmin(registerDto, creatorId);
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN)
    @Get('users')
    getAllUsers(@Query('page') page: number = 1, @Query('limit') limit: number = 10) {
        return this.authService.getAllUsers(page, limit);
    }

    // Fetch a single user profile by ID (Admin Only)
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN)
    @Get('users/:userId') // 
    async getUserById(@Param('userId') userId: string) {
        return this.authService.getUserById(userId);
    }

    // Update user status (Admin only)
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN)
    @Patch('users/:userId/status')
    updateUserStatus(
        @Param('userId') userId: string, @Body('status') status: string,) {
        return this.authService.updateUserStatus(userId, status as any);
    }
}





