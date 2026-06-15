import { IsEmail, IsString, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class FirstAccessDto {
  @IsEmail()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;

  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  currentPassword: string;

  @IsString()
  @MinLength(8)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  newPassword: string;
}
