import { IsString, IsOptional, Length } from 'class-validator';

export class UpdateProfileDto {
    @IsString()
    @IsOptional()
    @Length(2, 50)
    name?: string;
}