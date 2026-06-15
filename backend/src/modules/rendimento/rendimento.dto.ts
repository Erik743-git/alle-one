import { Type } from 'class-transformer';
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

export class ListPendingOvertimeQueryDto {
  @IsDateString()
  start!: string;

  @IsDateString()
  end!: string;

  @IsOptional()
  @IsUUID()
  userId?: string;
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
