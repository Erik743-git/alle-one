import { Transform } from 'class-transformer';
import { IsBooleanString, IsOptional, IsUUID } from 'class-validator';
import { optionalUuidQuery } from '../../common/validators/optional-uuid-query.transform';

export class FinancialOverviewQueryDto {
  /** Para ADMIN/COLLABORATOR: empresa alvo. Para CLIENT: ignorado. */
  @IsOptional()
  @Transform(({ value }) => optionalUuidQuery(value))
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsBooleanString()
  inline?: string;
}
