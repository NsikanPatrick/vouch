import { IsEmail, IsString, Length } from 'class-validator';

export class RequestOtpDto {
    @IsEmail()
    email: string;
}

export class VerifyOtpDto {
    @IsEmail()
    email: string;

    @IsString()
    @Length(6, 6, { message: 'Verification code must be exactly 6 characters.' })
    code: string;
}




