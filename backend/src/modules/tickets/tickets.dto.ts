import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (value === true || value === 'true' || value === 1 || value === '1') {
    return true;
  }
  if (value === false || value === 'false' || value === 0 || value === '0') {
    return false;
  }
  return undefined;
}

export class UpdateTicketStageDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  stageId!: number;
}

/** Busca usuários do portal para cópia/seguidores no create. */
export class SearchTicketUsersQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}

export class TicketsListQueryDto {
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => parseOptionalBoolean(value))
  mineOnly?: boolean;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  responsibleExternalId?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  clientExternalId?: number;

  @IsOptional()
  @IsString()
  stageName?: string;

  @IsOptional()
  @IsString()
  statusName?: string;

  @IsOptional()
  @IsString()
  deskName?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  ticketNumber?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  @Type(() => Number)
  limit?: number;

  /** Filtra tickets pela referência GMUD externa do cliente. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalGmudRef?: string;
}
