import { IsEmail, IsString, MinLength } from 'class-validator';

export class FirstAccessDto {
  @IsEmail()
  email: string;

  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}
