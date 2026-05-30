import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service-dmpFile';
import { User } from './entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { PasswordReset } from './entities/password-reset.entity';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { FileUploadModule } from '../file-upload/file-upload.module';


@Module({
  imports: [
    EventEmitterModule.forRoot(),
    TypeOrmModule.forFeature([User, RefreshToken, PasswordReset]),
    PassportModule,
    FileUploadModule,

    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: configService.get('JWT_ACCESS_EXPIRY', '15m'),
        },
      }),
      inject: [ConfigService],
    }),
    // EmailModule, // Emails are fired at the events module, so the auth module doesnt need it
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtRefreshStrategy,
    // AuthListener, // Event-related fxnalities are decoupled to the events module, so, the AuthListener provider is listed there instead
  ],
  exports: [AuthService],
})
export class AuthModule { }





