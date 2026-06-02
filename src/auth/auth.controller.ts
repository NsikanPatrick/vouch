import {
    Controller,
    Post,
    Body,
    Get,
    UseGuards,
    BadRequestException,
    // Request,
    Ip,
    Headers,
    Patch,
    Delete,
    Header,
    Query,
    Req,
    Res,
    ParseUUIDPipe,
    Param,
    UseInterceptors, UploadedFile
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { GoogleAuthGuard } from '../common/guards/google-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from './entities/user.entity';
import { RolesGuard } from '../common/guards/roles.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { UpdateProfileDto } from './dto/update-profile.dto';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';

// RETOUCHED 3: Created an explicit extended type interface for endpoints that rely on req.user
interface RequestWithUser extends ExpressRequest {
    user: {
        id: string;
        email: string;
        name: string;
        provider?: string;
        providerId?: string;
        role?: string;
    };
}


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

    // This part may give a little frontend issue, pay attention
    // Payload
    // // Token attached to the link sent on forgot password email
    // {
    //     "token": "66ff10c2-fdef-46a4-b10a-e165c8603548",
    //     "newPassword": "Nsikan0!"
    // }
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

        // The problem here is that the token gets missing for html, but works fine if the
        // token is copied from email to postman. 
        // It's majorly how the frontend handles the token
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

    // Delete user plus related files
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN)
    @Delete('users/:userId')
    async deleteUser(
        // ParseUUIDPipe for a clean validation error message, incase the wrong UUID is entered
        @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
        // @Request() req: any,
        @Req() req: RequestWithUser, 
    ) {
        // Extract the admin's ID from the JWT payload attached to the request by JwtAuthGuard
        const adminId = req.user.id;
        return this.authService.deleteUser(userId, adminId);
    }

    // ========== CONTROLLER FOR GOOGLE LOGIN ==============
    // Open your Google Cloud Console. => console.cloud.google.com
    // Navigate to your project, then go to the Google Auth Platform or APIs & Services > Credentials dashboard.
    // Under the Clients tab (or OAuth 2.0 Client IDs list), click your Web Application client to edit its settings.
    // Scroll down to the Authorized redirect URIs section.
    // Click + Add URI and paste your endpoint.
    // All the above is within the project you've already created in the cloud console
    // If you've not created a project before, when you get to console.cloud.google.com
    // Click "select a project" at the top left, create new project, then you proceed with the steps above
    // To edit the callback url in google console, goto the project, select clients from the left sidebar,
    // Go to this section on the main screen: OAuth 2.0 Client IDs, use the pencil button on the client
    // Scroll down to Authorized redirect URIs, then add you redirect url callback like: https://vouch-backend.vercel.app/api/v1/auth/google/callback

    // To test, go to this url on browser: http://localhost:1000/api/v1/auth/google
    // Deployment: https://vouch-backend.vercel.app/api/v1/auth/google
    // Ensure to set/update this calback on google console: http://localhost:1000/api/v1/auth/google/callback
    // Use your actual production url
    @Public()
    @Get('google')
    @UseGuards(GoogleAuthGuard) // Swapped string for your strongly-typed class guard
    async googleAuth(@Req() req: ExpressRequest) {
        // This handler remains empty. Passport automatically intercepts the execution
        // flow here and redirects the client browser straight to Google's sign-in screen.
    }

    @Public()
    @Get('google/callback')
    @UseGuards(GoogleAuthGuard) 
    async googleAuthRedirect(
        @Req() req: RequestWithUser, // Type ref to the extended interface containing .user property definition
        @Res() res: ExpressResponse, // Type reference to avoid metadata generation clashes
        @Ip() ip: string,
        @Headers('user-agent') userAgent: string
    ) {
        // req.user contains the profile object returned from GoogleStrategy.validate()
        const result = await this.authService.validateSocialLogin(req.user, ip, userAgent);

        // Callback url: https://vouch-backend.vercel.app/api/v1/auth/google/callback 
        // Redirect back to your frontend client with tokens appended as URL query parameters
        return res.redirect(
            // Ensure this url reflects your actual frontend url when the frontend is ready
            `https://vouch-backend.vercel.app/api/v1/auth/google/debug-view?token=${result.accessToken}&refresh=${result.refreshToken}`
        );
    }

    // This is a temporary success screen/route, will be replaced when the actual frontend is ready
    @Public()
    @Get('google/debug-view')
    async googleDebugView(@Query('token') token: string, @Query('refresh') refresh: string) {
        return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; border: 1px solid #ccc; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <h2 style="color: #1a73e8; margin-top: 0;">🎉 OAuth Success!</h2>
            <p style="color: #555;">This page shows the backend authentication system is fully working. You can now copy the access and refresh tokens below to test the authenticated endpoints in Postman:</p>
            
            <p><strong>Access Token (Bearer Token):</strong></p>
            <textarea style="width:100%; height:100px; font-family:monospace; padding:8px; box-sizing:border-box;" readonly>${token}</textarea>
            
            <p style="margin-top: 15px;"><strong>Refresh Token:</strong></p>
            <textarea style="width:100%; height:50px; font-family:monospace; padding:8px; box-sizing:border-box;" readonly>${refresh}</textarea>
        </div>
    `;
    }
}
















