import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EmailService } from '../../../email/email.service';
import { UserRegisteredEvent, EmailVerifiedEvent, PasswordResetRequestedEvent, PasswordResetSuccessEvent, AccountLockedEvent } from '../auth-events.service';

@Injectable()
export class AuthListener {
    private readonly logger = new Logger(AuthListener.name);

    constructor(private emailService: EmailService) { }

    @OnEvent(UserRegisteredEvent.eventName)
    async handleUserRegistered(event: UserRegisteredEvent) {
        this.logger.log(`Processing registration for user: ${event.user.email}`);

        try {
            await this.emailService.sendWelcomeEmail(
                event.user, // Passing the full user object, not event.user.email
                event.user.name,
                event.verificationToken
            );
            this.logger.log(`Welcome email sent to ${event.user.email}`);
        } catch (error) {
            this.logger.error(`Failed to send welcome email to ${event.user.email}:`, error);
        }
    }

    @OnEvent(EmailVerifiedEvent.eventName)
    async handleEmailVerified(event: EmailVerifiedEvent) {
        this.logger.log(`Email verified for user: ${event.user.email}`);
    }

    @OnEvent(PasswordResetRequestedEvent.eventName)
    async handlePasswordResetRequested(event: PasswordResetRequestedEvent) {
        this.logger.log(`Password reset requested for user: ${event.user.email}`);

        try {
            await this.emailService.sendPasswordResetEmail(
                event.user, // Passing the full user object
                event.user.name,
                event.resetToken
            );
            this.logger.log(`Password reset email sent to ${event.user.email}`);
        } catch (error) {
            this.logger.error(`Failed to send password reset email to ${event.user.email}:`, error);
        }
    }

    @OnEvent(PasswordResetSuccessEvent.eventName)
    async handlePasswordResetSuccess(event: PasswordResetSuccessEvent) {
        this.logger.log(`Password reset successful for user: ${event.user.email}`);

        try {
            await this.emailService.sendPasswordChangedEmail(
                event.user, // Passing the full user object
                event.user.name
            );
        } catch (error) {
            this.logger.error(`Failed to send password change confirmation to ${event.user.email}:`, error);
        }
    }

    @OnEvent(AccountLockedEvent.eventName)
    async handleAccountLocked(event: AccountLockedEvent) {
        this.logger.log(`Account locked for user: ${event.user.email}. Reason: ${event.reason}`);

        try {
            await this.emailService.sendAccountLockedEmail(
                event.user, // Passing the full user object
                event.user.name,
                event.user.lockedUntil || new Date(),
            );
        } catch (error) {
            this.logger.error(`Failed to send account lock notification to ${event.user.email}:`, error);
        }
    }
}