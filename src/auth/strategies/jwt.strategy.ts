import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        private configService: ConfigService,
        @InjectRepository(User)
        private usersRepository: Repository<User>,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: configService.get('JWT_ACCESS_SECRET') as string,
        });
    }

    async validate(payload: any) {
        // payload contains the decoded JWT data
        // { id: 'uuid', email: 'user@email.com', role: 'user', iat, exp }

        // Get fresh user data from database
        const user = await this.usersRepository.findOne({
            where: { id: payload.id },
            select: ['id', 'email', 'name', 'role', 'status', 'emailVerifiedAt'],
        });

        if (!user) {
            throw new UnauthorizedException('User no longer exists');
        }

        // Check if account is active
        if (user.status !== 'active') {
            throw new UnauthorizedException('Account is not active');
        }

        // Return user object to be attached to request
        return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
        };
    }
}