import {
  ArrayUnique,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  IsArray,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { UserRole, UserStatus } from '@prisma/client';
import { IsStrongPassword } from '../../../common/validators/password-constraints';

export class CreateUserDto {
  @IsString()
  name: string;

  @IsEmail()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;

  @IsOptional()
  @IsStrongPassword()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  password?: string;

  @IsEnum(UserRole)
  role: UserRole;

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
}
