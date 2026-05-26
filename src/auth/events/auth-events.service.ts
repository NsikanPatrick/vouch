import { User } from '../entities/user.entity';

// Event names are defnd here so u dont miss a spelling when during reference in the listener and the entity service where the event is emitted
// Event emitted when a new user registers
export class UserRegisteredEvent {
    static readonly eventName = 'user.registered';

    constructor(
        public readonly user: User,
        public readonly verificationToken: string,
    ) { }
}

// Event emitted when email is verified
export class EmailVerifiedEvent {
    static readonly eventName = 'email.verified';

    constructor(
        public readonly user: User,
    ) { }
}

// Event emitted when user logs in
export class UserLoggedInEvent {
    static readonly eventName = 'user.logged_in';

    constructor(
        public readonly user: User,
        public readonly ip: string,
        public readonly userAgent: string,
    ) { }
}

// Event emitted when user requests password reset
export class PasswordResetRequestedEvent {
    static readonly eventName = 'password.reset.requested';
    
    constructor(
        public readonly user: User,
        public readonly resetToken: string,
    ) { }
}

// Event emitted when password is successfully reset
export class PasswordResetSuccessEvent {
    static readonly eventName = 'password.reset.success';

    constructor(
        public readonly user: User,
    ) { }
}

// Event emitted when user is locked due to too many failed attempts
export class AccountLockedEvent {
    static readonly eventName = 'account.locked';

    constructor(
        public readonly user: User,
        public readonly reason: string,
    ) { }
}