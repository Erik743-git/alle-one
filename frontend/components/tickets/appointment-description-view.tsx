"use client";

import { useState } from "react";

import {
  appointmentDescriptionToPlainText,
  isAppointmentDoc,
  parseAppointmentDoc,
} from "@/lib/appointment-doc";
import { AppointmentImageChip } from "@/components/tickets/appointment-image-chip";
import { cn } from "@/lib/utils";

type Attachment = {
  fileId: string;
  originalName: string;
  mimeType: string;
  previewDataUrl?: string | null;
};

type ImagePreview = {
  key: string;
  fileId?: string;
  filename: string;
  previewDataUrl?: string | null;
};

type Props = {
  description: string | null | undefined;
  attachments: Attachment[];
};

function resolveImageAttachment(
  fileIndex: number,
  fileId: string | undefined,
  attachments: Attachment[],
): Attachment | undefined {
  if (fileId) {
    const byId = attachments.find((item) => item.fileId === fileId);
    if (byId?.mimeType.startsWith("image/")) return byId;
  }

  const direct = attachments[fileIndex];
  if (direct?.mimeType.startsWith("image/")) return direct;

  const images = attachments.filter((item) => item.mimeType.startsWith("image/"));
  return images[fileIndex] ?? images[0];
}

function collectImagePreviews(
  description: string,
  attachments: Attachment[],
): ImagePreview[] {
  if (isAppointmentDoc(description)) {
    const doc = parseAppointmentDoc(description);
    if (doc) {
      const seen = new Set<string>();
      const result: ImagePreview[] = [];
      for (const block of doc.blocks) {
        if (block.type !== "image") continue;
        const attachment = resolveImageAttachment(
          block.fileIndex,
          block.fileId,
          attachments,
        );
        const previewDataUrl = block.dataUrl ?? attachment?.previewDataUrl ?? null;
        const fileId = block.fileId ?? attachment?.fileId;
        const key = fileId ?? `inline-${result.length}`;
        if (seen.has(key)) continue;
        if (!previewDataUrl && !fileId) continue;
        seen.add(key);
        result.push({
          key,
          fileId,
          filename: attachment?.originalName ?? "Print",
          previewDataUrl,
        });
      }
      if (result.length > 0) return result;
    }
  }

  return attachments
    .filter((item) => item.mimeType.startsWith("image/"))
    .map((item) => ({
      key: item.fileId,
      fileId: item.fileId,
      filename: item.originalName,
      previewDataUrl: item.previewDataUrl,
    }));
}

function isLongText(text: string) {
  const lines = text.split(/\r?\n/);
  return lines.length > 3 || text.length > 220;
}

function FullDescriptionBody({ description }: { description: string }) {
  if (!isAppointmentDoc(description)) {
    return <p className="whitespace-pre-wrap text-foreground/90">{description}</p>;
  }

  const doc = parseAppointmentDoc(description);
  if (!doc) {
    return <p className="whitespace-pre-wrap text-foreground/90">{description}</p>;
  }

  return (
    <div className="space-y-2">
      {doc.blocks.map((block, index) => {
        if (block.type !== "text") return null;
        return (
          <p key={`text-${index}`} className="whitespace-pre-wrap text-foreground/90">
            {block.content}
          </p>
        );
      })}
    </div>
  );
}

export function AppointmentDescriptionView({ description, attachments }: Props) {
  const text = description?.trim();
  const [expanded, setExpanded] = useState(false);

  let plainText = "";
  if (text) {
    if (isAppointmentDoc(text)) {
      const doc = parseAppointmentDoc(text);
      if (doc) {
        plainText = doc.blocks
          .filter((block) => block.type === "text")
          .map((block) => block.content)
          .join("\n")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
      } else {
        plainText = appointmentDescriptionToPlainText(text);
      }
    } else {
      plainText = appointmentDescriptionToPlainText(text);
    }
  }

  const imagePreviews = text ? collectImagePreviews(text, attachments) : [];

  const hasLongText = Boolean(plainText && isLongText(plainText));
  const showCollapsed = hasLongText && !expanded;

  if (!text) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {plainText ? (
        <div>
          {showCollapsed ? (
            <p className="line-clamp-3 whitespace-pre-wrap text-foreground/90">
              {plainText}
            </p>
          ) : (
            <FullDescriptionBody description={text} />
          )}
          {hasLongText ? (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className={cn(
                "mt-0.5 text-xs text-muted-foreground underline-offset-2",
                "hover:text-foreground hover:underline",
              )}
            >
              {expanded ? "Recolher descrição" : "Descrição completa"}
            </button>
          ) : null}
        </div>
      ) : null}

      {imagePreviews.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {imagePreviews.map((image) => (
            <AppointmentImageChip
              key={image.key}
              fileId={image.fileId}
              filename={image.filename}
              previewDataUrl={image.previewDataUrl}
              variant="thumbnail"
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
