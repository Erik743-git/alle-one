import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';

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
