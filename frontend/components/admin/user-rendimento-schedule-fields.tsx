"use client";

import { Clock } from "lucide-react";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_RENDIMENTO_DAILY_WORK_MINUTES,
  DEFAULT_RENDIMENTO_LUNCH_MINUTES,
  formatMinutesAsHoursLabel,
  minutesToHoursInputValue,
  parseHoursInputToMinutes,
  type UserRendimentoScheduleValue,
  usesRendimentoScheduleRole,
} from "@/lib/user-rendimento-schedule";

type UserRendimentoScheduleFieldsProps = {
  role: string | null | undefined;
  value: UserRendimentoScheduleValue;
  onChange: (value: UserRendimentoScheduleValue) => void;
  disabled?: boolean;
};

export function UserRendimentoScheduleFields({
  role,
  value,
  onChange,
  disabled = false,
}: UserRendimentoScheduleFieldsProps) {
  if (!usesRendimentoScheduleRole(role)) {
    return null;
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-4 sm:col-span-2">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-primary" />
            <Label className="text-sm font-semibold text-foreground">
              Jornada no Rendimento
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">
            Define horas de trabalho e almoço desta pessoa. Em breve isso
            personaliza a análise da agenda de apontamentos.
          </p>
        </div>
        <Switch
          checked={value.rendimentoCustomSchedule}
          disabled={disabled}
          aria-label="Ativar jornada personalizada"
          onCheckedChange={(checked) =>
            onChange({
              ...value,
              rendimentoCustomSchedule: checked,
              rendimentoDailyWorkMinutes: checked
                ? value.rendimentoDailyWorkMinutes ||
                  DEFAULT_RENDIMENTO_DAILY_WORK_MINUTES
                : DEFAULT_RENDIMENTO_DAILY_WORK_MINUTES,
              rendimentoLunchMinutes: checked
                ? value.rendimentoLunchMinutes ||
                  DEFAULT_RENDIMENTO_LUNCH_MINUTES
                : DEFAULT_RENDIMENTO_LUNCH_MINUTES,
            })
          }
        />
      </div>

      {value.rendimentoCustomSchedule ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-foreground">
              Horas de trabalho / dia
            </Label>
            <Input
              type="number"
              min={1}
              max={12}
              step={0.5}
              disabled={disabled}
              value={minutesToHoursInputValue(value.rendimentoDailyWorkMinutes)}
              onChange={(e) => {
                const minutes = parseHoursInputToMinutes(e.target.value);
                if (minutes == null) return;
                onChange({
                  ...value,
                  rendimentoDailyWorkMinutes: minutes,
                });
              }}
              className="h-11"
            />
            <p className="text-xs text-muted-foreground">
              Atual: {formatMinutesAsHoursLabel(value.rendimentoDailyWorkMinutes)}
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold text-foreground">
              Almoço / dia
            </Label>
            <Input
              type="number"
              min={0.25}
              max={3}
              step={0.25}
              disabled={disabled}
              value={minutesToHoursInputValue(value.rendimentoLunchMinutes)}
              onChange={(e) => {
                const minutes = parseHoursInputToMinutes(e.target.value);
                if (minutes == null) return;
                onChange({
                  ...value,
                  rendimentoLunchMinutes: minutes,
                });
              }}
              className="h-11"
            />
            <p className="text-xs text-muted-foreground">
              Atual: {formatMinutesAsHoursLabel(value.rendimentoLunchMinutes)}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Padrão do portal:{" "}
          {formatMinutesAsHoursLabel(DEFAULT_RENDIMENTO_DAILY_WORK_MINUTES)} de
          trabalho e almoço de{" "}
          {formatMinutesAsHoursLabel(DEFAULT_RENDIMENTO_LUNCH_MINUTES)}.
        </p>
      )}
    </div>
  );
}
