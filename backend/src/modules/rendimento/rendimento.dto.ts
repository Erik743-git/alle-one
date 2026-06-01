import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export type RendimentoCalendarView = 'month' | 'week' | 'day';

export class RendimentoTimesheetQueryDto {
  @IsIn(['month', 'week', 'day'])
  view!: RendimentoCalendarView;

  /** Data de referência (YYYY-MM-DD). Padrão: hoje. */
  @IsOptional()
  @IsDateString()
  date?: string;
}

export class RendimentoUserIdParamDto {
  @IsUUID()
  userId!: string;
}

export class CreateRendimentoJustificationDto {
  @IsDateString()
  date!: string;

  @IsString()
  fromTime!: string;

  @IsString()
  toTime!: string;

  @IsIn(['idle', 'lunch'])
  gapType!: 'idle' | 'lunch';

  @IsInt()
  @Min(1)
  @Max(24 * 60)
  gapMinutes!: number;

  @IsIn(['ALERT', 'VOLUNTARY'])
  kind!: 'ALERT' | 'VOLUNTARY';

  @IsString()
  reason!: string;

  @IsOptional()
  @IsBoolean()
  debitOvertime?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(24 * 60)
  overtimeMinutes?: number;
}

export class DecideRendimentoJustificationDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  note?: string;
}

export class DecideRendimentoDayEventDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';
}
