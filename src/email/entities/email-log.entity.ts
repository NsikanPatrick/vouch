import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    Index,
    ManyToOne,
    JoinColumn
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

export enum EmailType {
    WELCOME = 'welcome',
    EMAIL_VERIFICATION = 'email_verification',
    PASSWORD_RESET = 'password_reset',
    PASSWORD_CHANGED = 'password_changed',
    ACCOUNT_LOCKED = 'account_locked',
    MAGIC_LINK = 'magic_link',
    TWO_FA = 'two_fa',
}

export enum EmailStatus {
    PENDING = 'pending',
    SENT = 'sent',
    DELIVERED = 'delivered',
    OPENED = 'opened',
    CLICKED = 'clicked',
    BOUNCED = 'bounced',
    FAILED = 'failed',
}

@Entity('email_logs')
@Index(['userId', 'createdAt'])
@Index(['email', 'createdAt'])
@Index(['type', 'status'])
export class EmailLog {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'userId' })
    user: User;

    @Column({ nullable: true })
    userId: string;

    @Column()
    @Index()
    email: string;

    @Column()
    name: string;

    @Column({
        type: 'enum',
        enum: EmailType,
    })
    @Index()
    type: EmailType;

    @Column()
    subject: string;

    @Column('text')
    body: string; // HTML or plain text content

    @Column({
        type: 'enum',
        enum: EmailStatus,
        default: EmailStatus.PENDING,
    })
    @Index()
    status: EmailStatus;

    @Column({ nullable: true })
    messageId: string; // Provider's message ID - SendGrid, AWS SES, etc

    @Column({ nullable: true, type: 'text' })
    errorMessage: string; // If email failed, store the error

    @Column({ nullable: true })
    sentAt: Date;

    @Column({ nullable: true })
    deliveredAt: Date;

    @Column({ nullable: true })
    openedAt: Date;

    @Column({ nullable: true })
    clickedAt: Date;

    @Column({ nullable: true })
    bounceReason: string;

    @Column({ type: 'jsonb', nullable: true })
    metadata: Record<string, any>; // Additional data (e.g., reset token, verification token)

    @Column({ type: 'jsonb', nullable: true })
    providerResponse: Record<string, any>; // Raw response from email provider

    @Column({ nullable: true })
    retryCount: number;

    @CreateDateColumn()
    createdAt: Date;

    // Helper methods
    markAsSent(messageId: string) {
        this.status = EmailStatus.SENT;
        this.messageId = messageId;
        this.sentAt = new Date();
    }

    markAsDelivered() {
        this.status = EmailStatus.DELIVERED;
        this.deliveredAt = new Date();
    }

    markAsOpened() {
        if (this.status === EmailStatus.DELIVERED || this.status === EmailStatus.SENT) {
            this.status = EmailStatus.OPENED;
            this.openedAt = new Date();
        }
    }

    markAsClicked() {
        if (this.status === EmailStatus.OPENED) {
            this.status = EmailStatus.CLICKED;
            this.clickedAt = new Date();
        }
    }

    markAsFailed(error: string) {
        this.status = EmailStatus.FAILED;
        this.errorMessage = error;
    }

    markAsBounced(reason: string) {
        this.status = EmailStatus.BOUNCED;
        this.bounceReason = reason;
    }
}





