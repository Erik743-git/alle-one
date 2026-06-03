"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
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

const timeSegmentClass =
  "h-8 w-11 min-w-0 rounded-md border-0 bg-muted/50 px-0 text-center text-sm font-medium tabular-nums shadow-none outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-muted/30 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

const timeFieldShellClass =
  "flex h-10 items-center justify-center gap-2 rounded-xl border border-input bg-background px-3 shadow-sm";

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
    <TimeInputs
      time={time}
      disabled={disabled}
      onTimeChange={onChange}
      layout="field"
      className={cn("w-full", className)}
    />
  );
}

function TimeInputs({
  time,
  disabled,
  onTimeChange,
  layout = "embedded",
  className,
}: {
  time: string;
  disabled?: boolean;
  onTimeChange: (time: string) => void;
  layout?: "field" | "embedded";
  className?: string;
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
    <div
      className={cn(
        timeFieldShellClass,
        layout === "field" ? "w-full" : "shrink-0",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      <input
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
        className={timeSegmentClass}
      />
      <span
        className="select-none text-sm font-semibold leading-none text-foreground"
        aria-hidden
      >
        :
      </span>
      <input
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
        className={timeSegmentClass}
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
    <div
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:items-stretch",
        className,
      )}
    >
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
        layout="embedded"
      />
    </div>
  );
}
