import { PermissionModule } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, ValidateNested } from 'class-validator';

export class PermissionRowDto {
  @IsEnum(PermissionModule)
  module!: PermissionModule;

  @IsBoolean()
  canView!: boolean;

  @IsBoolean()
  canCreate!: boolean;

  @IsBoolean()
  canEdit!: boolean;

  @IsBoolean()
  canDelete!: boolean;

  @IsBoolean()
  canApprove!: boolean;
}

export class PutUserPermissionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PermissionRowDto)
  permissions!: PermissionRowDto[];
}
