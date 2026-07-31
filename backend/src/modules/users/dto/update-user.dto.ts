import {
  ArrayUnique,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  IsArray,
  Max,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { UserRole, UserStatus } from '@prisma/client';
import { IsStrongPassword } from '../../../common/validators/password-constraints';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email?: string;

  @IsOptional()
  @IsStrongPassword()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  password?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsUUID()
  companyId?: string | null;

  @IsOptional()
  @IsBoolean()
  firstAccess?: boolean;

  @IsOptional()
  @IsBoolean()
  responsible?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  serviceDeskIds?: string[];

  @IsOptional()
  @IsBoolean()
  rendimentoCustomSchedule?: boolean;

  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(12 * 60)
  rendimentoDailyWorkMinutes?: number | null;

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(3 * 60)
  rendimentoLunchMinutes?: number | null;
}
