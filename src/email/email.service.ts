import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

@Injectable()
export class EmailService {
    private transporter: Transporter;
    private readonly logger = new Logger(EmailService.name);

    constructor(private configService: ConfigService) {
        // Initialize email transporter 
        // Fetching details from the global app.config file
        this.transporter = nodemailer.createTransport({
            host: this.configService.get<string>('appConfig.email.host'),
            port: this.configService.get<number>('appConfig.email.port'),
            secure: true, // true for 465, false for other ports
            auth: {
                user: this.configService.get<string>('appConfig.email.user'),
                pass: this.configService.get<string>('appConfig.email.pass'),
            },
        });
    }

    async sendWelcomeEmail(to: string, name: string, verificationToken: string): Promise<void> {
       
        // const verificationUrl = `${this.configService.get<string>('appConfig.frontendUrl')}/verify-email?token=${verificationToken}`;

        // Temp test verification email route
        // Remove the test from the verify-email-test when an actual frontend is available
        const verificationUrl = `${this.configService.get<string>('appConfig.frontendUrl')}/api/v1/auth/verify-email-test?token=${verificationToken}`;
        
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .button { 
                        display: inline-block; 
                        padding: 10px 20px; 
                        background-color: #df6161ff; 
                        color: #f1f1f1; 
                        text-decoration: none; 
                        border-radius: 5px;
                        margin: 20px 0;
                    }
                    .footer { margin-top: 30px; font-size: 12px; color: #666; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>Welcome to Vouch, ${name}!</h1>
                    <p>Thank you for registering with Vouch. Please verify your email address to get started.</p>
                    <a href="${verificationUrl}" class="button">Verify Email Address</a>
                    <p>Or copy and paste this link: ${verificationUrl}</p>
                    <p>This link will expire in 24 hours.</p>
                    <div class="footer">
                        <p>If you didn't create an account with Vouch, please ignore this email.</p>
                        <p>&copy; ${new Date().getFullYear()} Vouch. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        await this.sendEmail(to, 'Welcome to Vouch - Verify Your Email', html);
    }

    async sendPasswordResetEmail(to: string, name: string, resetToken: string): Promise<void> {
        // resetUrl is the frontend that will be redirected to from the email message, but
        // the frontend must still be processed by auth/reset-password, and that must be set in the frontend
        // check the temp markup in the controller to confirm.
        // Remove the test from the reset-password-test when an actual frontend is available
        const resetUrl = `${this.configService.get<string>('appConfig.frontendUrl')}/api/v1/auth/reset-password-test?token=${resetToken}`;

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .button { 
                        display: inline-block; 
                        padding: 10px 20px; 
                        background-color: #ff9800; 
                        color: white; 
                        text-decoration: none; 
                        border-radius: 5px;
                        margin: 20px 0;
                    }
                    .warning { background-color: #fff3cd; border: 1px solid #ffeeba; padding: 15px; margin: 20px 0; border-radius: 5px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>Password Reset Request</h1>
                    <p>Hello ${name},</p>
                    <p>We received a request to reset your password. Click the button below to create a new password:</p>
                    <a href="${resetUrl}" class="button">Reset Password</a>
                    <p>Or copy and paste this link: ${resetUrl}</p>
                    <p>This link will expire in 1 hour.</p>
                    <div class="warning">
                        <strong>⚠️ Security Notice:</strong> If you didn't request this password reset, please ignore this email and your password will remain unchanged.
                    </div>
                    <div class="footer">
                        <p>&copy; ${new Date().getFullYear()} Vouch. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        await this.sendEmail(to, 'Vouch - Password Reset Request', html);
    }

    async sendPasswordChangedEmail(to: string, name: string): Promise<void> {
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .success { background-color: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 5px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>Password Changed Successfully</h1>
                    <div class="success">
                        <p>Hello ${name},</p>
                        <p>Your password has been successfully changed.</p>
                        <p>If you did not perform this action, please contact our support team immediately.</p>
                    </div>
                    <div class="footer">
                        <p>&copy; ${new Date().getFullYear()} Vouch. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        await this.sendEmail(to, 'Vouch - Password Changed Successfully', html);
    }

    async sendAccountLockedEmail(to: string, name: string, lockedUntil: Date): Promise<void> {
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .alert { background-color: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; border-radius: 5px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>Account Security Alert</h1>
                    <div class="alert">
                        <p>Hello ${name},</p>
                        <p>Your account has been temporarily locked due to multiple failed login attempts.</p>
                        <p><strong>Locked until:</strong> ${lockedUntil.toLocaleString()}</p>
                        <p>If this wasn't you, please reset your password immediately or contact support.</p>
                    </div>
                    <div class="footer">
                        <p>&copy; ${new Date().getFullYear()} Vouch. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        await this.sendEmail(to, 'Vouch - Account Security Alert', html);
    }

    
    private async sendEmail(to: string, subject: string, html: string): Promise<void> {
        const fromName = this.configService.get<string>('appConfig.email.fromName');
        const fromAddress = this.configService.get<string>('appConfig.email.fromAddress');
        try {
            const info = await this.transporter.sendMail({
                from: `"${fromName}" <${fromAddress}>`,
                to,
                subject,
                html,
            });

            this.logger.log(`Email sent to ${to}: ${info.messageId}`);
        } catch (error) {
            this.logger.error(`Failed to send email to ${to}:`, error);
            throw error;
        }
    }
}