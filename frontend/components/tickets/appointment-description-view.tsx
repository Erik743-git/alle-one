"use client";

import { useState } from "react";

import {
  appointmentDescriptionToPlainText,
  isAppointmentDoc,
  looksLikeHtml,
  parseAppointmentDoc,
  stripHtmlToPlain,
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

  // HTML de e-mail já renderiza <img> no corpo — não repetir nos chips.
  if (
    looksLikeHtml(description) &&
    (/<img[\s\S]*src\s*=/i.test(description) ||
      description.includes("data:image/"))
  ) {
    return [];
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
  if (isAppointmentDoc(description)) {
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

  if (looksLikeHtml(description)) {
    return (
      <div
        className="prose prose-sm dark:prose-invert max-w-none text-foreground [&_*]:!text-inherit [&_a]:!text-primary [&_img]:!h-auto [&_img]:!w-auto [&_img]:max-h-[480px] [&_img]:max-w-full [&_img]:object-contain [&_img]:rounded-md"
        dangerouslySetInnerHTML={{ __html: description }}
      />
    );
  }

  return <p className="whitespace-pre-wrap text-foreground/90">{description}</p>;
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
    } else if (looksLikeHtml(text)) {
      plainText = stripHtmlToPlain(text);
    } else {
      plainText = appointmentDescriptionToPlainText(text);
    }
  }

  const imagePreviews = text ? collectImagePreviews(text, attachments) : [];

  const isHtml = Boolean(text && looksLikeHtml(text));
  const hasHtmlImages =
    isHtml &&
    (/<img[\s\S]*src\s*=/i.test(text!) || text!.includes("data:image/"));
  const hasLongText = Boolean(plainText && isLongText(plainText));
  // HTML só com print (assinatura etc.): sempre mostra o corpo, não some por falta de texto.
  const showCollapsed = hasLongText && !expanded && !hasHtmlImages;

  if (!text) {
    return <span className="text-muted-foreground">—</span>;
  }

  const showDescriptionBody = Boolean(plainText) || isHtml || isAppointmentDoc(text);

  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {showDescriptionBody ? (
        <div>
          {showCollapsed ? (
            <p className="line-clamp-3 whitespace-pre-wrap text-foreground/90">
              {plainText}
            </p>
          ) : (
            <FullDescriptionBody description={text} />
          )}
          {hasLongText && !hasHtmlImages ? (
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
