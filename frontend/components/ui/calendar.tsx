"use client";

import * as React from "react";
import { DayPicker, type DayPickerProps } from "react-day-picker";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export type CalendarProps = DayPickerProps;

function Calendar({
  className,
  showOutsideDays = true,
  classNames,
  components,
  formatters,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      locale={ptBR}
      showOutsideDays={showOutsideDays}
      className={cn("alle-calendar", className)}
      classNames={{
        root: "alle-calendar-root",
        months: "alle-calendar-months",
        month: "alle-calendar-month",
        month_caption: "alle-calendar-caption",
        caption_label: "alle-calendar-caption-label",
        nav: "alle-calendar-nav",
        button_previous: "alle-calendar-nav-btn",
        button_next: "alle-calendar-nav-btn",
        month_grid: "alle-calendar-grid",
        weekdays: "alle-calendar-weekdays",
        weekday: "alle-calendar-weekday",
        week: "alle-calendar-week",
        day: "alle-calendar-day",
        day_button: "alle-calendar-day-btn",
        selected: "alle-calendar-selected",
        today: "alle-calendar-today",
        outside: "alle-calendar-outside",
        disabled: "alle-calendar-disabled",
        ...classNames,
      }}
      formatters={{
        formatCaption: (date) =>
          format(date, "MMMM yyyy", { locale: ptBR }),
        formatWeekdayName: (date) =>
          format(date, "EEEEE", { locale: ptBR }).toUpperCase(),
        ...formatters,
      }}
      components={{
        Chevron: ({ className, orientation, ...chevronProps }) => {
          const Icon = orientation === "left" ? ChevronLeft : ChevronRight;
          return (
            <Icon
              className={cn("size-3.5 shrink-0", className)}
              aria-hidden
              {...chevronProps}
            />
          );
        },
        ...components,
      }}
      {...props}
    />
  );
}

export { Calendar };
