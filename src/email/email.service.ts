import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EmailLog, EmailType, EmailStatus } from './entities/email-log.entity';
import { User } from '../auth/entities/user.entity';

// Serverless is more compatible with Resend SDK instead of Nodemailer 
import { Resend } from 'resend';

@Injectable()
export class EmailService implements OnModuleInit {
    private resend: Resend;
    private readonly logger = new Logger(EmailService.name);
    private isConfigured = false;

    constructor(
        private configService: ConfigService,
        @InjectRepository(EmailLog)
        private emailLogRepository: Repository<EmailLog>,
        private eventEmitter: EventEmitter2,
    ) { }

    async onModuleInit() {
        this.initializeResend();
    }

    private async initializeResend() {
        try {
            const apiKey = this.configService.get<string>('RESEND_API_KEY'); //Traps value straight from the .env 

            if (!apiKey) {
                this.logger.warn('RESEND_API_KEY is missing. Emails will not be sent.');
                this.isConfigured = false;
                return;
            }

            this.resend = new Resend(apiKey);
            this.isConfigured = true;
            this.logger.log('Resend email service initialized successfully');

            // Test the API key
            // await this.testConnection();
        } catch (error) {
            this.logger.error('Failed to initialize Resend:', error);
            this.isConfigured = false;
        }
    }

    private async testConnection() {
        try {
            // Test if we can access the API
            const { data, error } = await this.resend.domains.list();
            if (error) {
                this.logger.warn('Resend API test failed:', error);
            } else {
                this.logger.log('Resend API connection successful');
            }
        } catch (error) {
            this.logger.warn('Resend API test error:', error.message);
        }
    }

    private async logEmail(
        email: string,
        name: string,
        type: EmailType,
        subject: string,
        body: string,
        user?: User,
        metadata?: Record<string, any>,
    ): Promise<EmailLog> {
        const emailLog = this.emailLogRepository.create({
            email,
            name,
            type,
            subject,
            body,
            userId: user?.id,
            user: user,
            metadata,
            status: EmailStatus.PENDING,
            retryCount: 0,
        });

        return await this.emailLogRepository.save(emailLog);
    }

    private async updateEmailLog(log: EmailLog, updates: Partial<EmailLog>) {
        Object.assign(log, updates);
        await this.emailLogRepository.save(log);
    }

    private async sendEmailWithResend(
        emailLog: EmailLog,
        to: string,
        subject: string,
        html: string,
    ): Promise<void> {
        if (!this.isConfigured) {
            const errorMsg = 'Resend email service not configured. Check RESEND_API_KEY';
            this.logger.error(errorMsg);
            await this.updateEmailLog(emailLog, {
                status: EmailStatus.FAILED,
                errorMessage: errorMsg,
            });
            throw new Error(errorMsg);
        }

        const fromAddress = this.configService.get<string>('appConfig.email.fromAddress');

        if (!fromAddress) {
            const errorMsg = 'EMAIL_FROM_ADDRESS is not configured';
            this.logger.error(errorMsg);
            await this.updateEmailLog(emailLog, {
                status: EmailStatus.FAILED,
                errorMessage: errorMsg,
            });
            throw new Error(errorMsg);
        }

        try {
            this.logger.log(`Attempting to send email to ${to} via Resend`);

            const { data, error } = await this.resend.emails.send({
                from: fromAddress,
                to: [to],
                subject: subject,
                html: html,
                headers: {
                    'X-Entity-Ref-ID': emailLog.id,
                    'X-Open-Tracking': 'true',    // Enable open tracking
                    'X-Click-Tracking': 'true',   // Enable click tracking
                },
                
            });

            if (error) {
                throw new Error(error.message);
            }

            this.logger.log(`Email sent successfully to ${to}, ID: ${data?.id}`);

            await this.updateEmailLog(emailLog, {
                status: EmailStatus.SENT,
                messageId: data?.id,
                sentAt: new Date(),
                providerResponse: data,
            });

            this.eventEmitter.emit('email.sent', {
                emailLogId: emailLog.id,
                email: to,
                type: emailLog.type,
                messageId: data?.id,
            });
        } catch (error) {
            this.logger.error(`Failed to send email to ${to}:`, error);

            await this.updateEmailLog(emailLog, {
                status: EmailStatus.FAILED,
                errorMessage: error.message,
                providerResponse: error,
                retryCount: (emailLog.retryCount || 0) + 1,
            });

            this.eventEmitter.emit('email.failed', {
                emailLogId: emailLog.id,
                email: to,
                type: emailLog.type,
                error: error.message,
                retryCount: emailLog.retryCount,
            });

            throw error;
        }
    }

    async sendWelcomeEmail(user: User, name: string, verificationToken: string): Promise<void> {
        const frontendUrl = this.configService.get<string>('appConfig.frontendUrl'); // Traps value from the appconfig file, appConfig file traps from env
        // Correct this here and in your controller file, when you have your active frontend
        const verificationUrl = `${frontendUrl}/api/v1/auth/verify-email-test?token=${verificationToken}`;

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
                        background-color: #d6a5b9ff; 
                        color: #faf8f8ff; 
                        text-decoration: none; 
                        border-radius: 5px;
                        margin: 20px 0;
                    }
                    .footer { margin-top: 30px; font-size: 12px; color: #666; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>Welcome to Vouch, ${user.name}!</h1>
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

        const emailLog = await this.logEmail(
            user.email,
            user.name,
            EmailType.WELCOME,
            'Welcome to Vouch - Verify Your Email',
            html,
            user,
            { verificationToken },
        );

        await this.sendEmailWithResend(emailLog, user.email, 'Welcome to Vouch - Verify Your Email', html);
    }

    async sendPasswordResetEmail(user: User, name: string, resetToken: string): Promise<void> {
        const frontendUrl = this.configService.get<string>('appConfig.frontendUrl');
        const resetUrl = `${frontendUrl}/api/v1/auth/reset-password-test?token=${resetToken}`;

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
                        color: #ffffffff; 
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
                    <p>Hello ${user.name},</p>
                    <p>We received a request to reset your password. Click the button below to create a new password:</p>
                    <a href="${resetUrl}" class="button">Reset Password</a>
                    <p>This link will expire in 1 hour.</p>
                    <div class="warning">
                        <strong>⚠️ Security Notice:</strong> If you didn't request this password reset, please ignore this email.
                    </div>
                    <div class="footer">
                        <p>&copy; ${new Date().getFullYear()} Vouch. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        const emailLog = await this.logEmail(
            user.email,
            user.name,
            EmailType.PASSWORD_RESET,
            'Vouch - Password Reset Request',
            html,
            user,
            { resetToken },
        );

        await this.sendEmailWithResend(emailLog, user.email, 'Vouch - Password Reset Request', html);
    }

    async sendPasswordChangedEmail(user: User, name: string): Promise<void> {
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
                        <p>Hello ${user.name},</p>
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

        const emailLog = await this.logEmail(
            user.email,
            user.name,
            EmailType.PASSWORD_CHANGED,
            'Vouch - Password Changed Successfully',
            html,
            user,
        );

        await this.sendEmailWithResend(emailLog, user.email, 'Vouch - Password Changed Successfully', html);
    }

    async sendAccountLockedEmail(user: User, name: string, lockedUntil: Date): Promise<void> {
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
                        <p>Hello ${user.name},</p>
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

        const emailLog = await this.logEmail(
            user.email,
            user.name,
            EmailType.ACCOUNT_LOCKED,
            'Vouch - Account Security Alert',
            html,
            user,
            { lockedUntil },
        );

        await this.sendEmailWithResend(emailLog, user.email, 'Vouch - Account Security Alert', html);
    }

    async sendMagicLinkEmail(user: User, magicToken: string): Promise<void> {
        const frontendUrl = this.configService.get<string>('appConfig.frontendUrl');
        const loginUrl = `${frontendUrl}/api/v1/auth/magic-login?token=${magicToken}`;

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
                        background-color: #2196f3; 
                        color: #ffffffff; 
                        text-decoration: none; 
                        border-radius: 5px;
                        margin: 20px 0;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>Magic Link Login</h1>
                    <p>Hello ${user.name},</p>
                    <p>Click the button below to login instantly (no password needed):</p>
                    <a href="${loginUrl}" class="button">Login to Vouch</a>
                    <p>This link will expire in 15 minutes.</p>
                </div>
            </body>
            </html>
        `;

        const emailLog = await this.logEmail(
            user.email,
            user.name,
            EmailType.MAGIC_LINK,
            'Vouch - Magic Link Login',
            html,
            user,
            { magicToken },
        );

        await this.sendEmailWithResend(emailLog, user.email, 'Vouch - Magic Link Login', html);
    }

    async trackEmailOpen(messageId: string): Promise<void> {
        const emailLog = await this.emailLogRepository.findOne({
            where: { messageId },
        });

        if (emailLog) {
            emailLog.markAsOpened();
            await this.emailLogRepository.save(emailLog);

            this.eventEmitter.emit('email.opened', {
                emailLogId: emailLog.id,
                email: emailLog.email,
                type: emailLog.type,
            });
        }
    }

    async trackEmailClick(messageId: string): Promise<void> {
        const emailLog = await this.emailLogRepository.findOne({
            where: { messageId },
        });

        if (emailLog && emailLog.status === EmailStatus.OPENED) {
            emailLog.markAsClicked();
            await this.emailLogRepository.save(emailLog);

            this.eventEmitter.emit('email.clicked', {
                emailLogId: emailLog.id,
                email: emailLog.email,
                type: emailLog.type,
            });
        }
    }

    async trackEmailBounce(messageId: string, reason: string): Promise<void> {
        const emailLog = await this.emailLogRepository.findOne({
            where: { messageId },
        });

        if (emailLog) {
            emailLog.markAsBounced(reason);
            await this.emailLogRepository.save(emailLog);

            this.eventEmitter.emit('email.bounced', {
                emailLogId: emailLog.id,
                email: emailLog.email,
                type: emailLog.type,
                reason,
            });
        }
    }

    async getEmailStats(startDate?: Date, endDate?: Date): Promise<any> {
        try {
            const queryBuilder = this.emailLogRepository
                .createQueryBuilder('email_log')
                .select('email_log.type', 'type')
                .addSelect('COUNT(*)', 'total')
                .addSelect('SUM(CASE WHEN email_log.status = :sent THEN 1 ELSE 0 END)', 'sent')
                .addSelect('SUM(CASE WHEN email_log.status = :delivered THEN 1 ELSE 0 END)', 'delivered')
                .addSelect('SUM(CASE WHEN email_log.status = :opened THEN 1 ELSE 0 END)', 'opened')
                .addSelect('SUM(CASE WHEN email_log.status = :clicked THEN 1 ELSE 0 END)', 'clicked')
                .addSelect('SUM(CASE WHEN email_log.status = :failed THEN 1 ELSE 0 END)', 'failed')
                .addSelect('SUM(CASE WHEN email_log.status = :bounced THEN 1 ELSE 0 END)', 'bounced')
                .setParameters({
                    sent: EmailStatus.SENT,
                    delivered: EmailStatus.DELIVERED,
                    opened: EmailStatus.OPENED,
                    clicked: EmailStatus.CLICKED,
                    failed: EmailStatus.FAILED,
                    bounced: EmailStatus.BOUNCED,
                });

            if (startDate && endDate && !isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
                queryBuilder.where('email_log.createdAt BETWEEN :startDate AND :endDate', {
                    startDate,
                    endDate
                });
            }

            const stats = await queryBuilder.groupBy('email_log.type').getRawMany();

            if (!stats || stats.length === 0) {
                const totalEmails = await this.emailLogRepository.count();
                const emailsByType = await this.emailLogRepository
                    .createQueryBuilder('email_log')
                    .select('email_log.type', 'type')
                    .addSelect('COUNT(*)', 'count')
                    .groupBy('email_log.type')
                    .getRawMany();

                return {
                    stats: [],
                    message: totalEmails === 0 ? 'No emails have been sent yet' : 'No emails found in the specified date range',
                    totalEmailsInDatabase: totalEmails,
                    emailsByType: emailsByType,
                };
            }

            return stats;
        } catch (error) {
            this.logger.error('Error getting email stats:', error);
            throw error;
        }
    }

    async getAllEmailLogs(page: number = 1, limit: number = 20) {
        const skip = (page - 1) * limit;

        const [logs, total] = await this.emailLogRepository.findAndCount({
            relations: ['user'],
            order: { createdAt: 'DESC' },
            skip,
            take: limit,
        });

        return {
            logs,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }
}


// import { Injectable, Logger } from '@nestjs/common';
// import { InjectRepository } from '@nestjs/typeorm';
// import { Repository } from 'typeorm';
// import { ConfigService } from '@nestjs/config';
// import { EventEmitter2 } from '@nestjs/event-emitter';
// import * as nodemailer from 'nodemailer';
// import { Transporter } from 'nodemailer';
// import { EmailLog, EmailType, EmailStatus } from './entities/email-log.entity';
// import { User } from '../auth/entities/user.entity';

// @Injectable()
// export class EmailService {
//     private transporter: Transporter;
//     private readonly logger = new Logger(EmailService.name);

//     constructor(
//         private configService: ConfigService,
//         @InjectRepository(EmailLog)
//         private emailLogRepository: Repository<EmailLog>,
//         private eventEmitter: EventEmitter2,
//     ) {
//         // Initialize email transporter
//         this.transporter = nodemailer.createTransport({
//             host: this.configService.get<string>('appConfig.email.host'),
//             port: this.configService.get<number>('appConfig.email.port'),
//             secure: true, // true for 465, false for other ports
//             auth: {
//                 user: this.configService.get<string>('appConfig.email.user'),
//                 pass: this.configService.get<string>('appConfig.email.pass'),
//             },
//         });
//     }

//     private async logEmail(
//         email: string,
//         name: string,
//         type: EmailType,
//         subject: string,
//         body: string,
//         user?: User,
//         metadata?: Record<string, any>,
//     ): Promise<EmailLog> {
//         const emailLog = this.emailLogRepository.create({
//             email,
//             name,
//             type,
//             subject,
//             body,
//             userId: user?.id,
//             user: user,
//             metadata,
//             status: EmailStatus.PENDING,
//             retryCount: 0,
//         });

//         return await this.emailLogRepository.save(emailLog);
//     }

//     private async updateEmailLog(log: EmailLog, updates: Partial<EmailLog>) {
//         Object.assign(log, updates);
//         await this.emailLogRepository.save(log);
//     }

//     private async sendEmailWithLog(
//         emailLog: EmailLog,
//         to: string,
//         subject: string,
//         html: string,
//     ): Promise<void> {
//         const fromName = this.configService.get<string>('appConfig.email.fromName');
//         const fromAddress = this.configService.get<string>('appConfig.email.fromAddress');

//         try {
//             const info = await this.transporter.sendMail({
//                 from: `"${fromName}" <${fromAddress}>`,
//                 to,
//                 subject,
//                 html,
//             });

//             // info.messageId should be the Resend email ID
//             console.log('Resend messageId:', info.messageId);
            
//             // Update log with success info
//             await this.updateEmailLog(emailLog, {
//                 status: EmailStatus.SENT,
//                 messageId: info.messageId,
//                 sentAt: new Date(),
//                 providerResponse: info,
//             });
            
//             this.logger.log(`Email sent to ${to}: ${info.messageId}`);
            
//             // Emit event for tracking
//             this.eventEmitter.emit('email.sent', {
//                 emailLogId: emailLog.id,
//                 email: to,
//                 type: emailLog.type,
//                 messageId: info.messageId,
//             });
//         } catch (error) {
//             // Update log with error
//             await this.updateEmailLog(emailLog, {
//                 status: EmailStatus.FAILED,
//                 errorMessage: error.message,
//                 providerResponse: error,
//                 retryCount: (emailLog.retryCount || 0) + 1,
//             });
            
//             this.logger.error(`Failed to send email to ${to}:`, error);
            
//             // Emit event for retry logic
//             this.eventEmitter.emit('email.failed', {
//                 emailLogId: emailLog.id,
//                 email: to,
//                 type: emailLog.type,
//                 error: error.message,
//                 retryCount: emailLog.retryCount,
//             });
            
//             throw error;
//         }
//     }

//     async sendWelcomeEmail(user: User, name: string, verificationToken: string): Promise<void> {
//         // const verificationUrl = `${this.configService.get('FRONTEND_URL')}/verify-email?token=${verificationToken}`;
        
//         // Temp test verification email route
//         // Remove the test from the verify-email-test when an actual frontend is available
//         const verificationUrl = `${this.configService.get<string>('appConfig.frontendUrl')}/api/v1/auth/verify-email-test?token=${verificationToken}`;
        
//         const html = `
//             <!DOCTYPE html>
//             <html>
//             <head>
//                 <style>
//                     body { font-family: Arial, sans-serif; line-height: 1.6; }
//                     .container { max-width: 600px; margin: 0 auto; padding: 20px; }
//                     .button { 
//                         display: inline-block; 
//                         padding: 10px 20px; 
//                         background-color: #d6a5b9ff; 
//                         color: #faf8f8ff; 
//                         text-decoration: none; 
//                         border-radius: 5px;
//                         margin: 20px 0;
//                     }
//                     .footer { margin-top: 30px; font-size: 12px; color: #666; }
//                 </style>
//             </head>
//             <body>
//                 <div class="container">
//                     <h1>Welcome toVouch, ${user.name}!</h1>
//                     <p>Thank you for registering with Vouch. Please verify your email address to get started.</p>
//                     <a href="${verificationUrl}" class="button">Verify Email Address</a>
//                     <p>Or copy and paste this link: ${verificationUrl}</p>
//                     <p>This link will expire in 24 hours.</p>
//                     <div class="footer">
//                         <p>If you didn't create an account with Vouch, please ignore this email.</p>
//                         <p>&copy; ${new Date().getFullYear()} Vouch. All rights reserved.</p>
//                     </div>
//                 </div>
//             </body>
//             </html>
//         `;

//         // Log the email
//         const emailLog = await this.logEmail(
//             user.email,
//             user.name,
//             EmailType.WELCOME,
//             'Welcome to Vouch - Verify Your Email',
//             html,
//             user,
//             { verificationToken },
//         );

//         await this.sendEmailWithLog(emailLog, user.email, 'Welcome to Vouch - Verify Your Email', html);
//     }

//     async sendPasswordResetEmail(user: User, name: string, resetToken: string): Promise<void> {
//         // const resetUrl = `${this.configService.get('FRONTEND_URL')}/reset-password?token=${resetToken}`;
        
//         // resetUrl is the frontend that will be redirected to from the email message, but
//         // the frontend must still be processed by auth/reset-password, and that must be set in the frontend
//         // check the temp markup in the controller to confirm.
//         // Remove the test from the reset-password-test when an actual frontend is available
//         const resetUrl = `${this.configService.get<string>('appConfig.frontendUrl')}/api/v1/auth/reset-password-test?token=${resetToken}`;
        
//         const html = `
//             <!DOCTYPE html>
//             <html>
//             <head>
//                 <style>
//                     body { font-family: Arial, sans-serif; line-height: 1.6; }
//                     .container { max-width: 600px; margin: 0 auto; padding: 20px; }
//                     .button { 
//                         display: inline-block; 
//                         padding: 10px 20px; 
//                         background-color: #ff9800; 
//                         color: #ffffffff; 
//                         text-decoration: none; 
//                         border-radius: 5px;
//                         margin: 20px 0;
//                     }
//                     .warning { background-color: #fff3cd; border: 1px solid #ffeeba; padding: 15px; margin: 20px 0; border-radius: 5px; }
//                 </style>
//             </head>
//             <body>
//                 <div class="container">
//                     <h1>Password Reset Request</h1>
//                     <p>Hello ${user.name},</p>
//                     <p>We received a request to reset your password. Click the button below to create a new password:</p>
//                     <a href="${resetUrl}" class="button">Reset Password</a>
//                     <p>Or copy and paste this link: ${resetUrl}</p>
//                     <p>This link will expire in 1 hour.</p>
//                     <div class="warning">
//                         <strong>⚠️ Security Notice:</strong> If you didn't request this password reset, please ignore this email and your password will remain unchanged.
//                     </div>
//                     <div class="footer">
//                         <p>&copy; ${new Date().getFullYear()} Vouch. All rights reserved.</p>
//                     </div>
//                 </div>
//             </body>
//             </html>
//         `;

//         const emailLog = await this.logEmail(
//             user.email,
//             user.name,
//             EmailType.PASSWORD_RESET,
//             'Vouch - Password Reset Request',
//             html,
//             user,
//             { resetToken },
//         );

//         await this.sendEmailWithLog(emailLog, user.email, 'Vouch - Password Reset Request', html);
//     }

//     async sendPasswordChangedEmail(user: User, name: string): Promise<void> {
//         const html = `
//             <!DOCTYPE html>
//             <html>
//             <head>
//                 <style>
//                     body { font-family: Arial, sans-serif; line-height: 1.6; }
//                     .container { max-width: 600px; margin: 0 auto; padding: 20px; }
//                     .success { background-color: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 5px; }
//                 </style>
//             </head>
//             <body>
//                 <div class="container">
//                     <h1>Password Changed Successfully</h1>
//                     <div class="success">
//                         <p>Hello ${user.name},</p>
//                         <p>Your password has been successfully changed.</p>
//                         <p>If you did not perform this action, please contact our support team immediately.</p>
//                     </div>
//                     <div class="footer">
//                         <p>&copy; ${new Date().getFullYear()} Vouch. All rights reserved.</p>
//                     </div>
//                 </div>
//             </body>
//             </html>
//         `;

//         const emailLog = await this.logEmail(
//             user.email,
//             user.name,
//             EmailType.PASSWORD_CHANGED,
//             'Vouch - Password Changed Successfully',
//             html,
//             user,
//         );

//         await this.sendEmailWithLog(emailLog, user.email, 'Vouch - Password Changed Successfully', html);
//     }

//     async sendAccountLockedEmail(user: User, name: string, lockedUntil: Date): Promise<void> {
//         const html = `
//             <!DOCTYPE html>
//             <html>
//             <head>
//                 <style>
//                     body { font-family: Arial, sans-serif; line-height: 1.6; }
//                     .container { max-width: 600px; margin: 0 auto; padding: 20px; }
//                     .alert { background-color: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; border-radius: 5px; }
//                 </style>
//             </head>
//             <body>
//                 <div class="container">
//                     <h1>Account Security Alert</h1>
//                     <div class="alert">
//                         <p>Hello ${user.name},</p>
//                         <p>Your account has been temporarily locked due to multiple failed login attempts.</p>
//                         <p><strong>Locked until:</strong> ${lockedUntil.toLocaleString()}</p>
//                         <p>If this wasn't you, please reset your password immediately or contact support.</p>
//                     </div>
//                     <div class="footer">
//                         <p>&copy; ${new Date().getFullYear()} Vouch. All rights reserved.</p>
//                     </div>
//                 </div>
//             </body>
//             </html>
//         `;

//         const emailLog = await this.logEmail(
//             user.email,
//             user.name,
//             EmailType.ACCOUNT_LOCKED,
//             'Vouch - Account Security Alert',
//             html,
//             user,
//             { lockedUntil },
//         );

//         await this.sendEmailWithLog(emailLog, user.email, 'Vouch - Account Security Alert', html);
//     }

//     // TODO: Implement magic link => Passwordless login
//     async sendMagicLinkEmail(user: User, magicToken: string): Promise<void> {
//         const loginUrl = `${this.configService.get<string>('appConfig.frontendUrl')}/api/v1/auth/magic-login?token=${magicToken}`;
        
//         const html = `
//             <!DOCTYPE html>
//             <html>
//             <head>
//                 <style>
//                     body { font-family: Arial, sans-serif; line-height: 1.6; }
//                     .container { max-width: 600px; margin: 0 auto; padding: 20px; }
//                     .button { 
//                         display: inline-block; 
//                         padding: 10px 20px; 
//                         background-color: #2196f3; 
//                         color: #ffffffff; 
//                         text-decoration: none; 
//                         border-radius: 5px;
//                         margin: 20px 0;
//                     }
//                 </style>
//             </head>
//             <body>
//                 <div class="container">
//                     <h1>Magic Link Login</h1>
//                     <p>Hello ${user.name},</p>
//                     <p>Click the button below to login instantly (no password needed):</p>
//                     <a href="${loginUrl}" class="button">Login to Vouch</a>
//                     <p>This link will expire in 15 minutes.</p>
//                 </div>
//             </body>
//             </html>
//         `;

//         const emailLog = await this.logEmail(
//             user.email,
//             user.name,
//             EmailType.MAGIC_LINK,
//             'Vouch - Magic Link Login',
//             html,
//             user,
//             { magicToken },
//         );

//         await this.sendEmailWithLog(emailLog, user.email, 'Vouch - Magic Link Login', html);
//     }


//     // Method to track email opens (from webhook)
//     async trackEmailOpen(messageId: string): Promise<void> {
//         const emailLog = await this.emailLogRepository.findOne({
//             where: { messageId },
//         });

//         if (emailLog) {
//             emailLog.markAsOpened();
//             await this.emailLogRepository.save(emailLog);
            
//             this.eventEmitter.emit('email.opened', {
//                 emailLogId: emailLog.id,
//                 email: emailLog.email,
//                 type: emailLog.type,
//             });
//         }
//     }

//     // Method to track email clicks (from webhook)
//     async trackEmailClick(messageId: string): Promise<void> {
//         const emailLog = await this.emailLogRepository.findOne({
//             where: { messageId },
//         });

//         if (emailLog && emailLog.status === EmailStatus.OPENED) {
//             emailLog.markAsClicked();
//             await this.emailLogRepository.save(emailLog);
            
//             this.eventEmitter.emit('email.clicked', {
//                 emailLogId: emailLog.id,
//                 email: emailLog.email,
//                 type: emailLog.type,
//             });
//         }
//     }

//     // Method to track email bounces (from webhook)
//     async trackEmailBounce(messageId: string, reason: string): Promise<void> {
//         const emailLog = await this.emailLogRepository.findOne({
//             where: { messageId },
//         });

//         if (emailLog) {
//             emailLog.markAsBounced(reason);
//             await this.emailLogRepository.save(emailLog);
            
//             this.eventEmitter.emit('email.bounced', {
//                 emailLogId: emailLog.id,
//                 email: emailLog.email,
//                 type: emailLog.type,
//                 reason,
//             });
//         }
//     }

//     // Method to get email statistics (for admin dashboard)
//     async getEmailStats(startDate?: Date, endDate?: Date): Promise<any> {
//         try {
//             const queryBuilder = this.emailLogRepository
//                 .createQueryBuilder('email_log')
//                 .select('email_log.type', 'type')
//                 .addSelect('COUNT(*)', 'total')
//                 .addSelect('SUM(CASE WHEN email_log.status = :sent THEN 1 ELSE 0 END)', 'sent')
//                 .addSelect('SUM(CASE WHEN email_log.status = :delivered THEN 1 ELSE 0 END)', 'delivered')
//                 .addSelect('SUM(CASE WHEN email_log.status = :opened THEN 1 ELSE 0 END)', 'opened')
//                 .addSelect('SUM(CASE WHEN email_log.status = :clicked THEN 1 ELSE 0 END)', 'clicked')
//                 .addSelect('SUM(CASE WHEN email_log.status = :failed THEN 1 ELSE 0 END)', 'failed')
//                 .addSelect('SUM(CASE WHEN email_log.status = :bounced THEN 1 ELSE 0 END)', 'bounced')
//                 .setParameters({
//                     sent: EmailStatus.SENT,
//                     delivered: EmailStatus.DELIVERED,
//                     opened: EmailStatus.OPENED,
//                     clicked: EmailStatus.CLICKED,
//                     failed: EmailStatus.FAILED,
//                     bounced: EmailStatus.BOUNCED,
//                 });

//             // Only add date filter if both dates are provided and valid
//             if (startDate && endDate && !isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
//                 queryBuilder.where('email_log.createdAt BETWEEN :startDate AND :endDate', {
//                     startDate,
//                     endDate
//                 });
//             }

//             const stats = await queryBuilder.groupBy('email_log.type').getRawMany();

//             // If no stats found, return a default response
//             if (!stats || stats.length === 0) {
//                 const totalEmails = await this.emailLogRepository.count();
//                 const emailsByType = await this.emailLogRepository
//                     .createQueryBuilder('email_log')
//                     .select('email_log.type', 'type')
//                     .addSelect('COUNT(*)', 'count')
//                     .groupBy('email_log.type')
//                     .getRawMany();

//                 return {
//                     stats: [],
//                     message: totalEmails === 0 ? 'No emails have been sent yet' : 'No emails found in the specified date range',
//                     totalEmailsInDatabase: totalEmails,
//                     emailsByType: emailsByType,
//                     suggestion: totalEmails > 0 ? 'Try removing date filters to see all emails' : 'Register a user to send a test email'
//                 };
//             }

//             return stats;
//         } catch (error) {
//             this.logger.error('Error getting email stats:', error);
//             throw error;
//         }
//     }

//     // Add a new method to get all email logs with details
//     async getAllEmailLogs(page: number = 1, limit: number = 20) {
//         const skip = (page - 1) * limit;

//         const [logs, total] = await this.emailLogRepository.findAndCount({
//             relations: ['user'],
//             order: { createdAt: 'DESC' },
//             skip,
//             take: limit,
//         });

//         return {
//             logs,
//             total,
//             page,
//             limit,
//             totalPages: Math.ceil(total / limit),
//         };
//     }

//     // // Method to get email statistics (for admin dashboard)
//     // async getEmailStats(startDate: Date, endDate: Date): Promise<any> {
//     //     const stats = await this.emailLogRepository
//     //         .createQueryBuilder('email_log')
//     //         .select('email_log.type', 'type')
//     //         .addSelect('COUNT(*)', 'total')
//     //         .addSelect('SUM(CASE WHEN email_log.status = :sent THEN 1 ELSE 0 END)', 'sent')
//     //         .addSelect('SUM(CASE WHEN email_log.status = :delivered THEN 1 ELSE 0 END)', 'delivered')
//     //         .addSelect('SUM(CASE WHEN email_log.status = :opened THEN 1 ELSE 0 END)', 'opened')
//     //         .addSelect('SUM(CASE WHEN email_log.status = :clicked THEN 1 ELSE 0 END)', 'clicked')
//     //         .addSelect('SUM(CASE WHEN email_log.status = :failed THEN 1 ELSE 0 END)', 'failed')
//     //         .addSelect('SUM(CASE WHEN email_log.status = :bounced THEN 1 ELSE 0 END)', 'bounced')
//     //         .where('email_log.createdAt BETWEEN :startDate AND :endDate', { startDate, endDate })
//     //         .setParameters({
//     //             sent: EmailStatus.SENT,
//     //             delivered: EmailStatus.DELIVERED,
//     //             opened: EmailStatus.OPENED,
//     //             clicked: EmailStatus.CLICKED,
//     //             failed: EmailStatus.FAILED,
//     //             bounced: EmailStatus.BOUNCED,
//     //         })
//     //         .groupBy('email_log.type')
//     //         .getRawMany();

//     //     return stats;
//     // }
// }