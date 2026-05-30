import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

// Load environment variables manually for the CLI runner
dotenv.config();

export default new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: true }
        : { rejectUnauthorized: false },
    synchronize: false, // Always false for safe migrations
    logging: process.env.NODE_ENV !== 'production',
    // Point directly to compiled JS entities and migrations
    entities: [__dirname + '/**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/migrations/*{.ts,.js}'],
    migrationsTableName: 'migrations',
});





