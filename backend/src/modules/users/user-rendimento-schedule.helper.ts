import { BadRequestException } from '@nestjs/common';

export const DEFAULT_RENDIMENTO_DAILY_WORK_MINUTES = 8 * 60;
export const DEFAULT_RENDIMENTO_LUNCH_MINUTES = 90;

const MIN_DAILY_WORK_MINUTES = 60;
const MAX_DAILY_WORK_MINUTES = 12 * 60;
const MIN_LUNCH_MINUTES = 15;
const MAX_LUNCH_MINUTES = 3 * 60;

export type RendimentoScheduleInput = {
  rendimentoCustomSchedule?: boolean;
  rendimentoDailyWorkMinutes?: number | null;
  rendimentoLunchMinutes?: number | null;
};

export type ResolvedRendimentoSchedule = {
  rendimentoCustomSchedule: boolean;
  rendimentoDailyWorkMinutes: number | null;
  rendimentoLunchMinutes: number | null;
};

export function resolveRendimentoSchedule(
  input: RendimentoScheduleInput,
): ResolvedRendimentoSchedule {
  const custom = input.rendimentoCustomSchedule === true;

  if (!custom) {
    return {
      rendimentoCustomSchedule: false,
      rendimentoDailyWorkMinutes: null,
      rendimentoLunchMinutes: null,
    };
  }

  const dailyWork = input.rendimentoDailyWorkMinutes;
  const lunch = input.rendimentoLunchMinutes;

  if (
    dailyWork == null ||
    lunch == null ||
    !Number.isFinite(dailyWork) ||
    !Number.isFinite(lunch)
  ) {
    throw new BadRequestException(
      'Informe as horas de trabalho e de almoço ao ativar a jornada personalizada.',
    );
  }

  if (
    dailyWork < MIN_DAILY_WORK_MINUTES ||
    dailyWork > MAX_DAILY_WORK_MINUTES
  ) {
    throw new BadRequestException(
      'Horas de trabalho devem estar entre 1h e 12h por dia.',
    );
  }

  if (lunch < MIN_LUNCH_MINUTES || lunch > MAX_LUNCH_MINUTES) {
    throw new BadRequestException(
      'Almoço deve estar entre 15 minutos e 3 horas.',
    );
  }

  if (lunch >= dailyWork) {
    throw new BadRequestException(
      'O almoço deve ser menor que a jornada de trabalho do dia.',
    );
  }

  return {
    rendimentoCustomSchedule: true,
    rendimentoDailyWorkMinutes: Math.round(dailyWork),
    rendimentoLunchMinutes: Math.round(lunch),
  };
}

export type EffectiveRendimentoSchedule = {
  dailyWorkMinutes: number;
  lunchMinutes: number;
  custom: boolean;
};

/** Valores efetivos para cálculo de rendimento (padrão do portal quando não personalizado). */
export function getEffectiveRendimentoSchedule(
  input: RendimentoScheduleInput,
): EffectiveRendimentoSchedule {
  if (
    input.rendimentoCustomSchedule === true &&
    input.rendimentoDailyWorkMinutes != null &&
    input.rendimentoLunchMinutes != null
  ) {
    return {
      custom: true,
      dailyWorkMinutes: input.rendimentoDailyWorkMinutes,
      lunchMinutes: input.rendimentoLunchMinutes,
    };
  }

  return {
    custom: false,
    dailyWorkMinutes: DEFAULT_RENDIMENTO_DAILY_WORK_MINUTES,
    lunchMinutes: DEFAULT_RENDIMENTO_LUNCH_MINUTES,
  };
}
