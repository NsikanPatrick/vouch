import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { CacheModule } from '@nestjs/cache-manager';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { EmailModule } from './email/email.module';
import { UserModule } from './user/user.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import appConfig from './config/app.config';
import { databaseConfig } from './config/database.config';
import { EventsModule } from './auth/events/events.module';
import { FileUploadModule } from './file-upload/file-upload.module';

@Module({
  imports: [
    // 1. Config module first (global)
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      envFilePath: '.env',
    }),
    // 2. Rate Limiting -> 10 req/min
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60,
          limit: 10,
        },
      ],
    }),
    // 3. Cache module
    CacheModule.register({
      isGlobal: true,
      ttl: 30000,
      max: 100, // Items in the cache
    }),
    // 4. Database connection
    TypeOrmModule.forRootAsync({
      useFactory: () => databaseConfig(),
    }),
    // 5. Scheduled tasks
    ScheduleModule.forRoot(),
    // 6. Feature and utility modules (Feature - AuthModule & UserModule), (Utility - EventsModule and EmailModule)
    AuthModule, UserModule, EventsModule, EmailModule, FileUploadModule,  // Just to wire up everything on the entire project and expose to main.ts file for serving, not necessarily to be used here
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
