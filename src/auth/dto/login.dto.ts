import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';

export class LoginDto {
    @IsEmail({}, { message: 'Please provide a valid email' })
    @IsNotEmpty()
    email: string;

    @IsNotEmpty({ message: 'Password is required' })
    @MinLength(1)
    password: string;
}





