// auth/strategies/google.strategy.ts
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
    constructor(configService: ConfigService) {
        super({
            // Use fallback or assertion to guarantee a string type to the compiler
            clientID: configService.get<string>('appConfig.google.clientId')!,
            clientSecret: configService.get<string>('appConfig.google.clientSecret')!,
            callbackURL: 'http://localhost:1000/api/v1/auth/google/callback',
            scope: ['email', 'profile'],
        });
    }

    async validate(
        accessToken: string,
        refreshToken: string,
        profile: any,
        done: VerifyCallback
    ): Promise<any> {
        const { name, emails, id } = profile;
        const user = {
            email: emails[0].value,
            name: `${name.givenName} ${name.familyName}`,
            provider: 'google',
            providerId: id,
        };
        done(null, user);
    }
}