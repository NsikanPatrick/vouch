import { Controller, Get, Query, UseGuards, Post, Body } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailService } from './email.service';
import { EmailLog, EmailStatus } from './entities/email-log.entity';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/entities/user.entity';

@Controller('admin/emails')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class EmailController {
    constructor(
        private emailService: EmailService,
        @InjectRepository(EmailLog)
        private emailLogRepository: Repository<EmailLog>,
    ) { }

    // Get email statistics with optional date range
    @Get('stats')
    async getEmailStats(
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
    ) {
        // If no dates provided, get all stats
        if (!startDate || !endDate) {
            const allStats = await this.emailLogRepository
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
                })
                .groupBy('email_log.type')
                .getRawMany();

            return {
                stats: allStats,
                totalEmails: await this.emailLogRepository.count()
            };
        }

        const start = new Date(startDate);
        const end = new Date(endDate);

        const stats = await this.emailService.getEmailStats(start, end);

        return {
            stats,
            dateRange: { startDate, endDate }
        };
    }

    // Get detailed email logs with pagination
    @Get('logs')
    async getEmailLogs(
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 20,
    ) {
        const skip = (page - 1) * limit;

        const [logs, total] = await this.emailLogRepository.findAndCount({
            relations: ['user'],
            order: { createdAt: 'DESC' },
            skip,
            take: limit,
        });

        return {
            logs: logs.map(log => ({
                id: log.id,
                email: log.email,
                name: log.name,
                type: log.type,
                status: log.status,
                subject: log.subject,
                sentAt: log.sentAt,
                deliveredAt: log.deliveredAt,
                openedAt: log.openedAt,
                clickedAt: log.clickedAt,
                createdAt: log.createdAt,
                messageId: log.messageId,
                errorMessage: log.errorMessage,
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    // TEST ENDPOINTS - For simulating email events (remove in production)
    @Post('test/simulate-delivery')
    async simulateDelivery(@Body('messageId') messageId: string) {
        const emailLog = await this.emailLogRepository.findOne({
            where: { messageId }
        });

        if (emailLog) {
            emailLog.status = EmailStatus.DELIVERED;
            emailLog.deliveredAt = new Date();
            await this.emailLogRepository.save(emailLog);
            return { message: 'Delivery simulated', emailLog };
        }
        return { message: 'Email log not found' };
    }

    @Post('test/simulate-open')
    async simulateOpen(@Body('messageId') messageId: string) {
        const emailLog = await this.emailLogRepository.findOne({
            where: { messageId }
        });

        if (emailLog && (emailLog.status === EmailStatus.SENT || emailLog.status === EmailStatus.DELIVERED)) {
            emailLog.status = EmailStatus.OPENED;
            emailLog.openedAt = new Date();
            await this.emailLogRepository.save(emailLog);
            return { message: 'Open simulated', emailLog };
        }
        return { message: 'Email log not found or invalid status' };
    }

    @Post('test/simulate-click')
    async simulateClick(@Body('messageId') messageId: string) {
        const emailLog = await this.emailLogRepository.findOne({
            where: { messageId }
        });

        if (emailLog && emailLog.status === EmailStatus.OPENED) {
            emailLog.status = EmailStatus.CLICKED;
            emailLog.clickedAt = new Date();
            await this.emailLogRepository.save(emailLog);
            return { message: 'Click simulated', emailLog };
        }
        return { message: 'Email log not found or email not opened yet' };
    }
}