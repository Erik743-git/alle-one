"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

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
  const preview = useMemo(() => previewText(description), [description]);
  const hasContent = Boolean(description?.trim()) || attachments.length > 0;

  if (!hasContent) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full max-w-[240px] items-center gap-1.5 rounded-md px-1.5 py-1 text-left",
            "hover:bg-muted/50",
          )}
          title="Ver descrição"
        >
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            {preview || "Ver descrição"}
          </span>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(24rem,calc(100vw-2rem))] p-3"
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
