import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
    constructor() {
        super({
            // This forces Google to always display the account chooser screen
            // preventing the app from auto-logging into a previously selected account
            prompt: 'select_account',
        });
    }

    // Optional: Override handles to intercept errors before NestJS throws a 500
    handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
        if (err || !user) {
            // You can log errors or redirect to a specific frontend failure page here
            throw err || new UnauthorizedException('Google authentication failed');
        }
        return user;
    }
}