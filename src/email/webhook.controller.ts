import { Controller, Post, Body, Headers, Logger, Req, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../common/decorators/public.decorator';
import { EmailService } from './email.service';
import { Resend } from 'resend';

@Controller('webhooks/email')
export class EmailWebhookController {
    private readonly logger = new Logger(EmailWebhookController.name);
    private resend: Resend;

    constructor(
        private emailService: EmailService,
        private configService: ConfigService,
    ) {
        // Initialize the Resend SDK instance using your configuration matrix
        this.resend = new Resend(this.configService.get<string>('appConfig.email.resendApiKey'));
    }

    @Public()
    @Post('resend')
    async handleResendWebhook(
        @Req() req: any, 
        @Headers('svix-id') svixId: string,
        @Headers('svix-timestamp') svixTimestamp: string,
        @Headers('svix-signature') svixSignature: string,
    ) {
        const secret = this.configService.get<string>('appConfig.email.webhookSecret');

        if (!secret) {
            this.logger.error('Webhook processing halted: "appConfig.email.webhookSecret" is missing from configuration.');
            throw new BadRequestException('Webhook misconfigured');
        }

        if (!svixId || !svixTimestamp || !svixSignature) {
            this.logger.warn('Webhook rejected: Missing required Svix security headers.');
            throw new BadRequestException('Missing webhook signature verification headers');
        }

        let event: any;

        try {
            const rawBody = req.rawBody.toString('utf8');

            const svixHeaders: Record<string, string> = {
                'svix-id': svixId,
                'svix-timestamp': svixTimestamp,
                'svix-signature': svixSignature,
            };

            // Cryptographically verify the notification came straight from Resend
            event = this.resend.webhooks.verify({
                payload: rawBody,
                webhookSecret: secret,
                // Cast the header dictionary to any to bypass the strict signature structure validation safely
                headers: {
                    'svix-id': svixId,
                    'svix-timestamp': svixTimestamp,
                    'svix-signature': svixSignature,
                } as any, 
            });
        } catch (error) {
            this.logger.error('Webhook signature verification failed safely:', error.message);
            throw new BadRequestException('Invalid cryptographic webhook signature');
        }

        // Process the verified payload data
        const eventType = event.type;         
        const emailData = event.data;         
        const emailId = emailData.email_id;   

        this.logger.log(`Received verified Resend webhook event: [${eventType}] for Email ID: ${emailId}`);

        switch (eventType) {
            case 'email.delivered':
                // Note: Ensure your tracking service logic matches these method requirements
                await this.emailService.trackEmailOpen(emailId); 
                break;

            case 'email.opened':
                await this.emailService.trackEmailOpen(emailId);
                break;

            case 'email.clicked':
                await this.emailService.trackEmailClick(emailId);
                break;

            case 'email.bounced':
                const bounceReason = emailData.bounce?.reason || 'Permanent hard bounce anomaly';
                await this.emailService.trackEmailBounce(emailId, bounceReason);
                break;

            case 'email.complained':
                this.logger.warn(`User flagged email as spam. ID: ${emailId}`);
                break;

            default:
                this.logger.debug(`Unhandled tracking event type state dropped: ${eventType}`);
        }

        return { received: true };
    }
} // 👈 Make sure this closing brace wraps the class block cleanly!