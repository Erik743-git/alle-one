import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class ReprocessRendimentoAlertsDto {
  /** Se omitido, reprocessa todos os colaboradores com vínculo TiFlux. */
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
