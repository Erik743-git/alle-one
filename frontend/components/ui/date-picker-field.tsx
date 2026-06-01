"use client";

import * as React from "react";
import { format, parse, isValid, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AlleCalendarPanel } from "@/components/ui/alle-calendar-panel";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type DatePickerFieldProps = {
  value: string;
  onChange: (isoDate: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** YYYY-MM-DD */
  min?: string;
  max?: string;
  allowClear?: boolean;
  /** Use dentro de modais (evita conflito com o Dialog do Radix). */
  modal?: boolean;
};

function parseIsoDate(value: string): Date | undefined {
  if (!value) return undefined;
  const d = parse(value, "yyyy-MM-dd", new Date());
  return isValid(d) ? startOfDay(d) : undefined;
}

function toIsoDate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function DatePickerField({
  value,
  onChange,
  placeholder = "Selecione a data",
  className,
  disabled,
  min,
  max,
  allowClear = false,
  modal = false,
}: DatePickerFieldProps) {
  const [open, setOpen] = React.useState(false);
  const selected = parseIsoDate(value);
  const minDate = min ? parseIsoDate(min) : undefined;
  const maxDate = max ? parseIsoDate(max) : undefined;

  const label = selected
    ? format(selected, "dd/MM/yyyy", { locale: ptBR })
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen} modal={modal}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "h-10 w-full justify-start rounded-xl border-input bg-background px-3 text-left text-sm font-normal font-sans shadow-sm",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-3.5 w-3.5 shrink-0 opacity-60" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="z-[100] w-auto overflow-visible border-border bg-card p-2 font-sans shadow-lg"
        align="start"
      >
        <AlleCalendarPanel
          selected={selected}
          min={minDate}
          max={maxDate}
          onSelect={(day) => {
            onChange(toIsoDate(day));
            setOpen(false);
          }}
          onClear={
            allowClear
              ? () => {
                  onChange("");
                  setOpen(false);
                }
              : undefined
          }
        />
      </PopoverContent>
    </Popover>
  );
}
