import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('otp_verifications')
export class OtpVerification {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    code: string; // Hashed string for security, or plain string if short-lived (e.g., 5 mins)

    @Column()
    email: string;

    @Column({ type: 'timestamp' })
    expiresAt: Date;

    @Column({ default: false })
    isUsed: boolean;

    @CreateDateColumn({ type: 'timestamp' }) // Type-optimized for Postgres
    createdAt: Date;

    @UpdateDateColumn({ type: 'timestamp' }) // To track when it gets marked as "isUsed"
    updatedAt: Date;
}