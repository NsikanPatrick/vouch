import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { PasswordReset } from '../auth/entities/password-reset.entity';
import { EmailLog } from '../email/entities/email-log.entity';
import { FileEntity } from '../file-upload/entities/file.entity';

export const databaseConfig = (): TypeOrmModuleOptions => ({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: true }
        : { rejectUnauthorized: false }, // Accept self-signed certs in dev
    synchronize: process.env.NODE_ENV !== 'production', // Auto-sync only in dev
    logging: process.env.NODE_ENV !== 'production',
    entities: [User, RefreshToken, PasswordReset, EmailLog, FileEntity],
    migrations: [__dirname + '/../migrations/*{.ts,.js}'],
    migrationsRun: process.env.NODE_ENV === 'production', // Auto-run migrations in production
    migrationsTableName: 'migrations',
    extra: {
        max: 20,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 30000,
    },
    retryAttempts: 5,
    retryDelay: 3000,
});





