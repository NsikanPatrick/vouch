import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EmailService } from '../../../email/email.service';
import { UserRegisteredEvent, EmailVerifiedEvent, PasswordResetRequestedEvent, PasswordResetSuccessEvent, AccountLockedEvent } from '../auth-events.service';

@Injectable()
export class AuthListener {
    private readonly logger = new Logger(AuthListener.name);

    constructor(private emailService: EmailService) { }

    // Event listeners are referenced by their names from the auth-events.service

    // Handle user registration - Send welcome email
    // @OnEvent('user.registered', { async: true })
    @OnEvent(UserRegisteredEvent.eventName, { async: true })
    async handleUserRegistered(event: UserRegisteredEvent) {
        this.logger.log(`Processing registration for user: ${event.user.email}`);

        try {
            await this.emailService.sendWelcomeEmail(
                event.user.email,
                event.user.name,
                event.verificationToken
            );
            this.logger.log(`Welcome email sent to ${event.user.email}`);
        } catch (error) {
            this.logger.error(`Failed to send welcome email to ${event.user.email}:`, error);
        }
    }

    // Handle email verification
    // @OnEvent('email.verified')
    @OnEvent(EmailVerifiedEvent.eventName)
    async handleEmailVerified(event: EmailVerifiedEvent) {
        this.logger.log(`Email verified for user: ${event.user.email}`);

        // Here you could:
        // - Update user analytics
        // - Grant bonus points
        // - Send welcome dashboard link
        // - Create default user settings
    }

    // Handle password reset request
    // @OnEvent('password.reset.requested')
    @OnEvent(PasswordResetRequestedEvent.eventName)
    async handlePasswordResetRequested(event: PasswordResetRequestedEvent) {
        this.logger.log(`Password reset requested for user: ${event.user.email}`);

        try {
            await this.emailService.sendPasswordResetEmail(
                event.user.email,
                event.user.name,
                event.resetToken
            );
            this.logger.log(`Password reset email sent to ${event.user.email}`);
        } catch (error) {
            this.logger.error(`Failed to send password reset email to ${event.user.email}:`, error);
        }
    }

    // Handle password reset success
    // @OnEvent('password.reset.success')
    @OnEvent(PasswordResetSuccessEvent.eventName)
    async handlePasswordResetSuccess(event: PasswordResetSuccessEvent) {
        this.logger.log(`Password reset successful for user: ${event.user.email}`);

        // Send confirmation email
        try {
            await this.emailService.sendPasswordChangedEmail(
                event.user.email,
                event.user.name
            );
        } catch (error) {
            this.logger.error(`Failed to send password change confirmation to ${event.user.email}:`, error);
        }
    }

    // Handle account lock
    // @OnEvent('account.locked')
    @OnEvent(AccountLockedEvent.eventName)
    async handleAccountLocked(event: AccountLockedEvent) {
        this.logger.log(`Account locked for user: ${event.user.email}. Reason: ${event.reason}`);

        try {
            await this.emailService.sendAccountLockedEmail(
                event.user.email,
                event.user.name,
                event.user.lockedUntil || new Date(),
            );
        } catch (error) {
            this.logger.error(`Failed to send account lock notification to ${event.user.email}:`, error);
        }
    }
}











