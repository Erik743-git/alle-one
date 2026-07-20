import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
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
import { optionalUuidQuery } from '../../common/validators/optional-uuid-query.transform';

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

  /** Limites do alerta clicado (opcional; reforça período parcial dentro do gap). */
  @IsOptional()
  @IsString()
  alertFromTime?: string;

  @IsOptional()
  @IsString()
  alertToTime?: string;
}

export class UpdateRendimentoJustificationDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  fromTime?: string;

  @IsOptional()
  @IsString()
  toTime?: string;

  @IsOptional()
  @IsString()
  alertFromTime?: string;

  @IsOptional()
  @IsString()
  alertToTime?: string;

  @IsOptional()
  @IsBoolean()
  debitOvertime?: boolean;

  @IsString()
  reason!: string;
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

export class ListPendingOvertimeQueryDto {
  @IsDateString()
  start!: string;

  @IsDateString()
  end!: string;

  @IsOptional()
  @Transform(({ value }) => optionalUuidQuery(value))
  @IsUUID()
  userId?: string;

  /** Um ou mais: PENDING, APPROVED, REJECTED (padrão: PENDING). */
  @IsOptional()
  @Transform(({ value }) => {
    const raw =
      value == null || value === ''
        ? ['PENDING']
        : Array.isArray(value)
          ? value
          : [value];
    const flat = raw
      .flatMap((entry) => String(entry).split(','))
      .map((entry) => entry.trim())
      .filter(Boolean);
    const allowed = new Set(['PENDING', 'APPROVED', 'REJECTED']);
    const unique = [...new Set(flat.filter((entry) => allowed.has(entry)))];
    return unique.length ? unique : ['PENDING'];
  })
  @IsArray()
  @IsIn(['PENDING', 'APPROVED', 'REJECTED'], { each: true })
  statusFilters?: Array<'PENDING' | 'APPROVED' | 'REJECTED'>;
}

export class BulkDecideRendimentoDayEventsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  ids!: string[];

  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';
}

export class BulkDecideRendimentoJustificationsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  ids!: string[];

  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  note?: string;
}

export class RendimentoCompanyAgendaQueryDto {
  @IsIn(['month', 'week', 'day'])
  view!: 'month' | 'week' | 'day';

  @IsOptional()
  @IsDateString()
  date?: string;
}

export class CreateRendimentoAppointmentQuestionDto {
  @IsIn(['tiflux', 'portal'])
  appointmentSource!: 'tiflux' | 'portal';

  @IsString()
  appointmentRef!: string;

  @Type(() => Number)
  @IsInt()
  ticketNumber!: number;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsString()
  initTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @IsString()
  userName?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  message!: string;
}

export class AnswerRendimentoAppointmentQuestionDto {
  @IsString()
  responseNote!: string;

  @IsOptional()
  @IsBoolean()
  abonar?: boolean;

  @IsOptional()
  @IsString()
  responseCode?: string;
}

export class ListCompanyQuestionsQueryDto {
  @IsOptional()
  @IsIn(['PENDING', 'ANSWERED'])
  status?: 'PENDING' | 'ANSWERED';
}

export class UpdateCollaboratorListPreferenceDto {
  @IsBoolean()
  listed!: boolean;
}
