export const DEFAULT_RENDIMENTO_DAILY_WORK_MINUTES = 8 * 60;
export const DEFAULT_RENDIMENTO_LUNCH_MINUTES = 90;

export type UserRendimentoScheduleValue = {
  rendimentoCustomSchedule: boolean;
  rendimentoDailyWorkMinutes: number;
  rendimentoLunchMinutes: number;
};

export function defaultUserRendimentoSchedule(): UserRendimentoScheduleValue {
  return {
    rendimentoCustomSchedule: false,
    rendimentoDailyWorkMinutes: DEFAULT_RENDIMENTO_DAILY_WORK_MINUTES,
    rendimentoLunchMinutes: DEFAULT_RENDIMENTO_LUNCH_MINUTES,
  };
}

export function normalizeUserRendimentoSchedule(input: {
  rendimentoCustomSchedule?: boolean;
  rendimentoDailyWorkMinutes?: number | null;
  rendimentoLunchMinutes?: number | null;
}): UserRendimentoScheduleValue {
  return {
    rendimentoCustomSchedule: input.rendimentoCustomSchedule === true,
    rendimentoDailyWorkMinutes:
      input.rendimentoDailyWorkMinutes ??
      DEFAULT_RENDIMENTO_DAILY_WORK_MINUTES,
    rendimentoLunchMinutes:
      input.rendimentoLunchMinutes ?? DEFAULT_RENDIMENTO_LUNCH_MINUTES,
  };
}

export function formatMinutesAsHoursLabel(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${String(minutes).padStart(2, "0")}min`;
}

export function formatUserRendimentoScheduleSummary(
  schedule: Pick<
    UserRendimentoScheduleValue,
    | "rendimentoCustomSchedule"
    | "rendimentoDailyWorkMinutes"
    | "rendimentoLunchMinutes"
  >,
): string {
  if (!schedule.rendimentoCustomSchedule) {
    return `Padrão (${formatMinutesAsHoursLabel(DEFAULT_RENDIMENTO_DAILY_WORK_MINUTES)} / almoço ${formatMinutesAsHoursLabel(DEFAULT_RENDIMENTO_LUNCH_MINUTES)})`;
  }
  return `${formatMinutesAsHoursLabel(schedule.rendimentoDailyWorkMinutes)} / almoço ${formatMinutesAsHoursLabel(schedule.rendimentoLunchMinutes)}`;
}

export function usesRendimentoScheduleRole(
  role: "ADMIN" | "COLLABORATOR" | "PJ" | "CLIENT",
): boolean {
  return role === "ADMIN" || role === "COLLABORATOR" || role === "PJ";
}

export function parseHoursInputToMinutes(value: string): number | null {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 60);
}

export function minutesToHoursInputValue(minutes: number): string {
  const hours = minutes / 60;
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}
