"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import { AppointmentDescriptionView } from "@/components/tickets/appointment-description-view";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { appointmentDescriptionToPlainText } from "@/lib/appointment-doc";
import { cn } from "@/lib/utils";

type Attachment = {
  fileId: string;
  originalName: string;
  mimeType: string;
  previewDataUrl?: string | null;
};

type Props = {
  description: string | null | undefined;
  attachments: Attachment[];
};

const HOVER_OPEN_MS = 350;
const HOVER_CLOSE_MS = 200;

function previewText(description: string | null | undefined) {
  const plain = appointmentDescriptionToPlainText(description ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return "";
  return plain.length > 64 ? `${plain.slice(0, 64)}…` : plain;
}

export function AppointmentDescriptionCell({
  description,
  attachments,
}: Props) {
  const [open, setOpen] = useState(false);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preview = useMemo(() => previewText(description), [description]);
  const hasContent = Boolean(description?.trim()) || attachments.length > 0;

  const clearTimers = useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleOpen = useCallback(() => {
    clearTimers();
    openTimerRef.current = setTimeout(() => setOpen(true), HOVER_OPEN_MS);
  }, [clearTimers]);

  const scheduleClose = useCallback(() => {
    clearTimers();
    closeTimerRef.current = setTimeout(() => setOpen(false), HOVER_CLOSE_MS);
  }, [clearTimers]);

  if (!hasContent) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          className={cn(
            "flex w-full max-w-[240px] cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-left",
            "hover:bg-muted/50",
          )}
          title="Ver descrição"
          onMouseEnter={scheduleOpen}
          onMouseLeave={scheduleClose}
          onFocus={scheduleOpen}
          onBlur={scheduleClose}
        >
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            {preview || "Ver descrição"}
          </span>
        </div>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(24rem,calc(100vw-2rem))] p-3"
        onMouseEnter={() => {
          if (closeTimerRef.current) {
            clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
          }
        }}
        onMouseLeave={scheduleClose}
      >
        <div className="max-h-72 overflow-y-auto overflow-x-hidden break-words [overflow-wrap:anywhere]">
          <AppointmentDescriptionView
            description={description}
            attachments={attachments}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
