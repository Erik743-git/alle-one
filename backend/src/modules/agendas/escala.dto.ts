import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export class EscalaRegraDto {
  @IsUUID()
  userId!: string;

  @IsUUID()
  specialtyId!: string;

  @Matches(HHMM, { message: 'Início no formato HH:MM.' })
  startTime!: string;

  @Matches(HHMM, { message: 'Fim no formato HH:MM.' })
  endTime!: string;

  /** 0 = domingo ... 6 = sábado. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek!: number[];

  @Matches(YMD, { message: 'Início da validade como AAAA-MM-DD.' })
  validFrom!: string;

  @IsOptional()
  @Matches(YMD, { message: 'Fim da validade como AAAA-MM-DD.' })
  validTo?: string | null;
}

export class EscalaExcecaoDto {
  @IsUUID()
  regraId!: string;

  /** Dia em que o turno começa. */
  @Matches(YMD, { message: 'Dia como AAAA-MM-DD.' })
  date!: string;

  @IsIn(['FOLGA', 'TROCA'])
  tipo!: 'FOLGA' | 'TROCA';

  @IsOptional()
  @IsUUID()
  substituteUserId?: string | null;

  @IsOptional()
  @Matches(HHMM, { message: 'Início do recorte no formato HH:MM.' })
  startTime?: string | null;

  @IsOptional()
  @Matches(HHMM, { message: 'Fim do recorte no formato HH:MM.' })
  endTime?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 300)
  motivo?: string | null;
}
