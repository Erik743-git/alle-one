import { IsEnum, IsUUID } from 'class-validator';
import { ClientCompanyRole } from '@prisma/client';

export class UpsertUserCompanyMembershipDto {
  @IsUUID()
  companyId!: string;

  @IsEnum(ClientCompanyRole)
  clientRole!: ClientCompanyRole;
}
