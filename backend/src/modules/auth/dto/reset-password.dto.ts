import { IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { IsStrongPassword } from '../../../common/validators/password-constraints';

export class ResetPasswordDto {
  @IsString()
  token: string;

  @IsString()
  @IsStrongPassword()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  newPassword: string;
}
