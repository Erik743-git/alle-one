import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { optionalUuidQuery } from '../../common/validators/optional-uuid-query.transform';

export type TifluxContractStatus = 'actives' | 'readjust' | 'expired';

export class ListContractsQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  offset?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  /** Para ADMIN/COLLABORATOR: empresa alvo. Para CLIENT: ignorado. */
  @IsOptional()
  @Transform(({ value }) => optionalUuidQuery(value))
  @IsUUID()
  companyId?: string;

  /** Ex.: "actives,expired". Default: actives (TiFlux) */
  @IsOptional()
  @IsString()
  status?: string;
}
