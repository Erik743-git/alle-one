"use client";

import { useId, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

type Props = {
  text: string;
  maxLines?: number;
  className?: string;
  textClassName?: string;
};

function needsExpansion(text: string, maxLines: number) {
  const lines = text.split(/\r?\n/);
  return lines.length > maxLines || text.length > maxLines * 72;
}

export function CompactExpandableText({
  text,
  maxLines = 3,
  className,
  textClassName,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  const collapsible = useMemo(
    () => needsExpansion(text, maxLines),
    [text, maxLines],
  );

  if (!text.trim()) {
    return null;
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <p
        id={contentId}
        className={cn(
          "whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground",
          textClassName,
        )}
        style={
          collapsible && !expanded
            ? {
                display: "-webkit-box",
                WebkitLineClamp: maxLines,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }
            : undefined
        }
      >
        {text}
      </p>

      {collapsible ? (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => setExpanded((value) => !value)}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2 py-1",
            "text-[11px] font-medium text-muted-foreground",
            "bg-muted/40 ring-1 ring-border/70",
            "transition hover:bg-muted hover:text-foreground",
          )}
        >
          {expanded ? "Recolher" : "Ver mais"}
          <ChevronDown
            className={cn(
              "size-3.5 opacity-70 transition-transform duration-200",
              expanded && "rotate-180",
            )}
          />
        </button>
      ) : null}
    </div>
  );
}
