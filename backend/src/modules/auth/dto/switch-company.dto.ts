import { IsUUID } from 'class-validator';

export class SwitchCompanyDto {
  @IsUUID()
  companyId!: string;
}
