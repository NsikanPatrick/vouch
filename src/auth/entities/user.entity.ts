import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    UpdateDateColumn,
    OneToMany,
    Index,
    BeforeInsert,
    BeforeUpdate
} from 'typeorm';
import { RefreshToken } from './refresh-token.entity';
import { PasswordReset } from './password-reset.entity';

export enum UserRole {
    USER = 'user',
    ADMIN = 'admin',
    MODERATOR = 'moderator',
}

export enum AccountStatus {
    ACTIVE = 'active',
    INACTIVE = 'inactive',
    SUSPENDED = 'suspended',
    PENDING_VERIFICATION = 'pending_verification',
}

@Entity('users')
export class User {
    @PrimaryGeneratedColumn('uuid') // Use UUID for better security
    id: string;

    @Column({ unique: true })
    @Index()
    email: string;

    @Column()
    name: string;

    @Column({ select: false }) // Don't include in normal queries
    password: string;

    @Column({
        type: 'enum',
        enum: UserRole,
        default: UserRole.USER,
    })
    role: UserRole;

    @Column({
        type: 'enum',
        enum: AccountStatus,
        default: AccountStatus.PENDING_VERIFICATION,
    })
    status: AccountStatus;

    @Column({ nullable: true })
    emailVerifiedAt: Date;

    @Column({ nullable: true })
    lastLoginAt: Date;

    @Column({ nullable: true })
    lastLoginIp: string;


    @Column({ default: 0 })
    loginAttempts: number;

    @Column({ type: 'timestamp', nullable: true })
    lockedUntil: Date | null; // Added | null here // Account lock until date (after too many failed attempts)

    @Column({ nullable: true })
    profilePicture: string;

    @OneToMany(() => RefreshToken, (token) => token.user, { cascade: true })
    refreshTokens: RefreshToken[];

    @OneToMany(() => PasswordReset, (reset) => reset.user, { cascade: true })
    passwordResets: PasswordReset[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    // Lifecycle hooks
    @BeforeInsert()
    @BeforeUpdate()
    emailToLowerCase() {
        if (this.email) {
            this.email = this.email.toLowerCase();
        }
    }

    // Check if account is locked
    isLocked(): boolean | null {
        return this.lockedUntil && this.lockedUntil > new Date();
    }

    // Check if email is verified
    isEmailVerified(): boolean {
        return !!this.emailVerifiedAt;
    }
}