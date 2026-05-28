import { Controller, Post, Body, Logger, HttpCode, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailLog, EmailStatus } from './entities/email-log.entity';
import { Public } from '../common/decorators/public.decorator';
import { EventEmitter2 } from '@nestjs/event-emitter';

interface ResendWebhookEvent {
    type: 'email.delivered' | 'email.opened' | 'email.clicked' | 'email.bounced' | 'email.complained';
    data: {
        created_at: string;
        email_id: string;
        from: string;
        to: string[];
        subject: string;
        client_info?: {
            user_agent?: string;
            ip_address?: string;
        };
        click?: {
            link: string;
            user_agent?: string;
            ip_address?: string;
        };
        bounce?: {
            reason: string;
            type: 'permanent' | 'temporary';
        };
    };
}

@Controller('webhooks/resend')
export class ResendWebhookController {
    private readonly logger = new Logger(ResendWebhookController.name);

    constructor(
        @InjectRepository(EmailLog)
        private emailLogRepository: Repository<EmailLog>,
        private eventEmitter: EventEmitter2,
    ) { }

    @Public()
    @Post()
    @HttpCode(HttpStatus.OK)
    async handleResendWebhook(@Body() payload: ResendWebhookEvent) {
        this.logger.log(`Received Resend webhook: ${payload.type}`);

        try {
            switch (payload.type) {
                case 'email.delivered':
                    await this.handleEmailDelivered(payload);
                    break;
                case 'email.opened':
                    await this.handleEmailOpened(payload);
                    break;
                case 'email.clicked':
                    await this.handleEmailClicked(payload);
                    break;
                case 'email.bounced':
                    await this.handleEmailBounced(payload);
                    break;
                case 'email.complained':
                    await this.handleEmailComplained(payload);
                    break;
                default:
                    this.logger.warn(`Unknown webhook type: ${payload.type}`);
            }

            return { received: true };
        } catch (error) {
            this.logger.error(`Error processing webhook: ${error.message}`);
            return { received: true, error: error.message };
        }
    }

    private async handleEmailDelivered(event: ResendWebhookEvent) {
        const messageId = event.data.email_id;

        const emailLog = await this.emailLogRepository.findOne({
            where: { messageId }
        });

        if (emailLog) {
            emailLog.status = EmailStatus.DELIVERED;
            emailLog.deliveredAt = new Date(event.data.created_at);
            await this.emailLogRepository.save(emailLog);

            this.eventEmitter.emit('email.delivered', {
                emailLogId: emailLog.id,
                email: emailLog.email,
                type: emailLog.type,
            });

            this.logger.log(`Email ${messageId} marked as delivered`);
        } else {
            this.logger.warn(`Email log not found for messageId: ${messageId}`);
        }
    }

    private async handleEmailOpened(event: ResendWebhookEvent) {
        const messageId = event.data.email_id;

        const emailLog = await this.emailLogRepository.findOne({
            where: { messageId }
        });

        if (emailLog) {
            if (emailLog.status === EmailStatus.SENT || emailLog.status === EmailStatus.DELIVERED) {
                emailLog.status = EmailStatus.OPENED;
                emailLog.openedAt = new Date(event.data.created_at);

                if (event.data.client_info) {
                    emailLog.metadata = {
                        ...emailLog.metadata,
                        openedWith: {
                            userAgent: event.data.client_info.user_agent,
                            ipAddress: event.data.client_info.ip_address,
                            openedAt: event.data.created_at,
                        }
                    };
                }

                await this.emailLogRepository.save(emailLog);

                this.eventEmitter.emit('email.opened', {
                    emailLogId: emailLog.id,
                    email: emailLog.email,
                    type: emailLog.type,
                });

                this.logger.log(`Email ${messageId} marked as opened`);
            }
        } else {
            this.logger.warn(`Email log not found for messageId: ${messageId}`);
        }
    }

    private async handleEmailClicked(event: ResendWebhookEvent) {
        const messageId = event.data.email_id;

        const emailLog = await this.emailLogRepository.findOne({
            where: { messageId }
        });

        if (emailLog) {
            emailLog.status = EmailStatus.CLICKED;
            emailLog.clickedAt = new Date(event.data.created_at);

            if (event.data.click) {
                emailLog.metadata = {
                    ...emailLog.metadata,
                    clicked: {
                        link: event.data.click.link,
                        userAgent: event.data.click.user_agent,
                        ipAddress: event.data.click.ip_address,
                        clickedAt: event.data.created_at,
                    }
                };
            }

            await this.emailLogRepository.save(emailLog);

            this.eventEmitter.emit('email.clicked', {
                emailLogId: emailLog.id,
                email: emailLog.email,
                type: emailLog.type,
                link: event.data.click?.link,
            });

            this.logger.log(`Email ${messageId} marked as clicked`);
        } else {
            this.logger.warn(`Email log not found for messageId: ${messageId}`);
        }
    }

    private async handleEmailBounced(event: ResendWebhookEvent) {
        const messageId = event.data.email_id;

        const emailLog = await this.emailLogRepository.findOne({
            where: { messageId }
        });

        if (emailLog) {
            const bounceReason = event.data.bounce?.reason || 'Unknown reason';
            emailLog.markAsBounced(bounceReason);

            if (event.data.bounce) {
                emailLog.metadata = {
                    ...emailLog.metadata,
                    bounce: {
                        reason: event.data.bounce.reason,
                        type: event.data.bounce.type,
                        bouncedAt: event.data.created_at,
                    }
                };
            }

            await this.emailLogRepository.save(emailLog);

            this.eventEmitter.emit('email.bounced', {
                emailLogId: emailLog.id,
                email: emailLog.email,
                type: emailLog.type,
                reason: bounceReason,
            });

            this.logger.log(`Email ${messageId} bounced: ${bounceReason}`);
        } else {
            this.logger.warn(`Email log not found for messageId: ${messageId}`);
        }
    }

    private async handleEmailComplained(event: ResendWebhookEvent) {
        const messageId = event.data.email_id;

        const emailLog = await this.emailLogRepository.findOne({
            where: { messageId }
        });

        if (emailLog) {
            emailLog.metadata = {
                ...emailLog.metadata,
                complained: {
                    complainedAt: event.data.created_at,
                    type: 'spam_report',
                }
            };

            await this.emailLogRepository.save(emailLog);

            this.logger.log(`Email ${messageId} marked as complained (spam report)`);
        } else {
            this.logger.warn(`Email log not found for messageId: ${messageId}`);
        }
    }
}