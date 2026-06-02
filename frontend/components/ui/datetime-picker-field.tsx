"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { DatePickerField } from "@/components/ui/date-picker-field";

type DateTimePickerFieldProps = {
  /** Formato `YYYY-MM-DDTHH:mm` (datetime-local). */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  datePlaceholder?: string;
};

function splitDateTime(value: string) {
  if (!value) return { date: "", time: "09:00" };
  const [date, time] = value.split("T");
  const normalizedTime = (time ?? "09:00").slice(0, 5);
  return { date: date ?? "", time: normalizedTime || "09:00" };
}

function joinDateTime(date: string, time: string) {
  if (!date) return "";
  return `${date}T${time || "09:00"}`;
}

function clampHour(raw: string) {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return 9;
  return Math.min(23, Math.max(0, n));
}

function clampMinute(raw: string) {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return 0;
  return Math.min(59, Math.max(0, n));
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function TimePickerField({
  value,
  onChange,
  disabled,
  className,
}: {
  value: string;
  onChange: (time: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const time = value?.trim() ? value.slice(0, 5) : "09:00";
  return (
    <div
      className={cn(
        "flex h-10 w-full items-center justify-center rounded-xl border border-input bg-background px-2 shadow-sm",
        disabled && "opacity-50",
        className,
      )}
    >
      <TimeInputs time={time} disabled={disabled} onTimeChange={onChange} />
    </div>
  );
}

function TimeInputs({
  time,
  disabled,
  onTimeChange,
}: {
  time: string;
  disabled?: boolean;
  onTimeChange: (time: string) => void;
}) {
  const [hour, minute] = time.split(":");
  const [hourDraft, setHourDraft] = React.useState(() =>
    pad2(clampHour(hour || "09")),
  );
  const [minuteDraft, setMinuteDraft] = React.useState(() =>
    pad2(clampMinute(minute || "00")),
  );

  React.useEffect(() => {
    setHourDraft(pad2(clampHour(hour || "09")));
    setMinuteDraft(pad2(clampMinute(minute || "00")));
  }, [hour, minute]);

  const commit = React.useCallback(
    (nextHour: string, nextMinute: string) => {
      const hh = pad2(clampHour(nextHour));
      const mm = pad2(clampMinute(nextMinute));
      onTimeChange(`${hh}:${mm}`);
      setHourDraft(hh);
      setMinuteDraft(mm);
    },
    [onTimeChange],
  );

  function setNumericDraft(
    setter: (value: string) => void,
    raw: string,
    maxLen = 2,
  ) {
    const next = raw.replace(/[^\d]/g, "").slice(0, maxLen);
    setter(next);
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label="Hora"
        disabled={disabled}
        value={hourDraft}
        onChange={(e) => setNumericDraft(setHourDraft, e.target.value)}
        onBlur={() => commit(hourDraft, minuteDraft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(hourDraft, minuteDraft);
        }}
        onWheel={(e) => e.currentTarget.blur()}
        className="h-10 w-[3.25rem] rounded-xl px-1 text-center text-sm shadow-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <span className="text-sm text-muted-foreground">:</span>
      <Input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label="Minuto"
        disabled={disabled}
        value={minuteDraft}
        onChange={(e) => setNumericDraft(setMinuteDraft, e.target.value)}
        onBlur={() => commit(hourDraft, minuteDraft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(hourDraft, minuteDraft);
        }}
        onWheel={(e) => e.currentTarget.blur()}
        className="h-10 w-[3.25rem] rounded-xl px-1 text-center text-sm shadow-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
    </div>
  );
}

export function DateTimePickerField({
  value,
  onChange,
  disabled,
  className,
  datePlaceholder = "Selecione a data",
}: DateTimePickerFieldProps) {
  const { date, time } = splitDateTime(value);
  const timeDisabled = disabled || !date;

  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row sm:items-center", className)}>
      <DatePickerField
        value={date}
        onChange={(nextDate) => onChange(joinDateTime(nextDate, time))}
        disabled={disabled}
        placeholder={datePlaceholder}
        className="min-w-0 flex-1"
      />
      <TimeInputs
        time={time}
        disabled={timeDisabled}
        onTimeChange={(nextTime) => onChange(joinDateTime(date, nextTime))}
      />
    </div>
  );
}
