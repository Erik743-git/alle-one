"use client";

import * as React from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  setMonth,
  setYear,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const WEEKDAYS = [
  { key: "sun", label: "Dom" },
  { key: "mon", label: "Seg" },
  { key: "tue", label: "Ter" },
  { key: "wed", label: "Qua" },
  { key: "thu", label: "Qui" },
  { key: "fri", label: "Sex" },
  { key: "sat", label: "Sáb" },
] as const;

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: i,
  label: format(new Date(2020, i, 1), "MMMM", { locale: ptBR }),
}));

type CalendarPickerOption<T extends string | number> = {
  value: T;
  label: string;
};

function CalendarPicker<T extends string | number>({
  value,
  options,
  ariaLabel,
  onChange,
  open,
  onOpenChange,
}: {
  value: T;
  options: CalendarPickerOption<T>[];
  ariaLabel: string;
  onChange: (value: T) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const selectedLabel =
    options.find((option) => option.value === value)?.label ?? "";

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (
        rootRef.current &&
        !rootRef.current.contains(event.target as Node)
      ) {
        onOpenChange(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, onOpenChange]);

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="alle-datepicker__select w-full"
        onClick={() => onOpenChange(!open)}
      >
        <span className="truncate capitalize">{selectedLabel}</span>
      </button>
      {open ? (
        <ul
          role="listbox"
          aria-label={ariaLabel}
          className="alle-datepicker__menu"
        >
          {options.map((option) => (
            <li key={String(option.value)} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={cn(
                  "alle-datepicker__menu-item capitalize",
                  option.value === value && "alle-datepicker__menu-item--active",
                )}
                onClick={() => {
                  onChange(option.value);
                  onOpenChange(false);
                }}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

type AlleCalendarPanelProps = {
  selected?: Date;
  onSelect: (date: Date) => void;
  onClear?: () => void;
  min?: Date;
  max?: Date;
};

function startOfDayOrUndefined(d?: Date) {
  return d ? startOfDay(d) : undefined;
}

export function AlleCalendarPanel({
  selected,
  onSelect,
  onClear,
  min,
  max,
}: AlleCalendarPanelProps) {
  const minDay = startOfDayOrUndefined(min);
  const maxDay = startOfDayOrUndefined(max);

  const [viewMonth, setViewMonth] = React.useState(() =>
    startOfMonth(selected ?? new Date()),
  );
  const [openPicker, setOpenPicker] = React.useState<"month" | "year" | null>(
    null,
  );

  React.useEffect(() => {
    if (selected) {
      setViewMonth(startOfMonth(selected));
    }
  }, [selected]);

  const monthStart = startOfMonth(viewMonth);
  const days = eachDayOfInterval({
    start: startOfWeek(monthStart, { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 0 }),
  });

  const yearOptions = React.useMemo(() => {
    const y = new Date().getFullYear();
    const from = (minDay?.getFullYear() ?? y - 8) - 1;
    const to = (maxDay?.getFullYear() ?? y + 2) + 1;
    const list: CalendarPickerOption<number>[] = [];
    for (let i = from; i <= to; i += 1) {
      list.push({ value: i, label: String(i) });
    }
    return list;
  }, [minDay, maxDay]);

  const isDisabled = (day: Date) => {
    const d = startOfDay(day);
    if (minDay && d < minDay) return true;
    if (maxDay && d > maxDay) return true;
    return false;
  };

  return (
    <div className="alle-datepicker font-sans">
      <div className="alle-datepicker__header">
        <button
          type="button"
          className="alle-datepicker__arrow"
          aria-label="Mês anterior"
          onClick={() => {
            setOpenPicker(null);
            setViewMonth((m) => subMonths(m, 1));
          }}
        >
          <ChevronLeft className="size-4" />
        </button>

        <div className="alle-datepicker__selects">
          <CalendarPicker
            ariaLabel="Mês"
            value={viewMonth.getMonth()}
            options={MONTH_OPTIONS}
            open={openPicker === "month"}
            onOpenChange={(next) => setOpenPicker(next ? "month" : null)}
            onChange={(monthIndex) =>
              setViewMonth((m) => setMonth(m, monthIndex))
            }
          />
          <CalendarPicker
            ariaLabel="Ano"
            value={viewMonth.getFullYear()}
            options={yearOptions}
            open={openPicker === "year"}
            onOpenChange={(next) => setOpenPicker(next ? "year" : null)}
            onChange={(year) => setViewMonth((m) => setYear(m, year))}
          />
        </div>

        <button
          type="button"
          className="alle-datepicker__arrow"
          aria-label="Próximo mês"
          onClick={() => {
            setOpenPicker(null);
            setViewMonth((m) => addMonths(m, 1));
          }}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="alle-datepicker__weekdays">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday.key} className="alle-datepicker__weekday">
            {weekday.label}
          </span>
        ))}
      </div>

      <div className="alle-datepicker__grid">
        {days.map((day) => {
          const outside = !isSameMonth(day, viewMonth);
          const isSelected = selected ? isSameDay(day, selected) : false;
          const isTodayDay = isToday(day);
          const disabled = isDisabled(day);

          return (
            <button
              key={day.toISOString()}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(startOfDay(day))}
              className={cn(
                "alle-datepicker__day",
                outside && "alle-datepicker__day--outside",
                isSelected && "alle-datepicker__day--selected",
                isTodayDay && !isSelected && "alle-datepicker__day--today",
                disabled && "alle-datepicker__day--disabled",
              )}
            >
              <span>{format(day, "d")}</span>
            </button>
          );
        })}
      </div>

      <div className="alle-datepicker__footer">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 flex-1 rounded-lg text-xs"
          onClick={() => onSelect(startOfDay(new Date()))}
        >
          Hoje
        </Button>
        {onClear ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 flex-1 rounded-lg text-xs text-muted-foreground"
            onClick={onClear}
          >
            Limpar
          </Button>
        ) : null}
      </div>
    </div>
  );
}
