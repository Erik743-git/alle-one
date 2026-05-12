import { IsBooleanString, IsOptional, IsUUID } from 'class-validator';

export class FinancialOverviewQueryDto {
  /** Para ADMIN/COLLABORATOR: empresa alvo. Para CLIENT: ignorado. */
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsBooleanString()
  inline?: string;
}
