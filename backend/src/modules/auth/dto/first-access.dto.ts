import { IsEmail, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { IsStrongPassword } from '../../../common/validators/password-constraints';

export class FirstAccessDto {
  @IsEmail()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;

  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  currentPassword: string;

  @IsString()
  @IsStrongPassword()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  newPassword: string;
}
