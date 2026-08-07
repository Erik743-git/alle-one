import { ArrayUnique, IsArray, IsEnum } from 'class-validator';
import { PermissionModule } from '@prisma/client';

export class UpdateCompanyModulesDto {
  @IsArray()
  @ArrayUnique()
  @IsEnum(PermissionModule, { each: true })
  modules!: PermissionModule[];
}
