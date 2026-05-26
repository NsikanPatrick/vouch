import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
    Index
} from 'typeorm';
import { User } from './user.entity';

@Entity('refresh_tokens')
export class RefreshToken {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    @Index()
    token: string;

    @ManyToOne(() => User, (user) => user.refreshTokens, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'userId' })
    user: User;

    @Column()
    userId: string;

    @Column()
    expiresAt: Date;

    @Column({ nullable: true })
    revokedAt: Date;

    @Column({ nullable: true })
    revokedReason: string;

    @Column({ nullable: true })
    userAgent: string;

    @Column({ nullable: true })
    ipAddress: string;

    @CreateDateColumn()
    createdAt: Date;

    // Check if token is expired
    isExpired(): boolean {
        return this.expiresAt < new Date();
    }

    // Check if token is revoked
    isRevoked(): boolean {
        return !!this.revokedAt;
    }

    // Check if token is valid (not expired and not revoked)
    isValid(): boolean {
        return !this.isExpired() && !this.isRevoked();
    }
}