"use client";

import { useState } from "react";

import {
  appointmentDescriptionToPlainText,
  COMPOSER_HTML_CLASS,
  isAppointmentDoc,
  looksLikeHtml,
  parseAppointmentDoc,
  stripHtmlToPlain,
  type StoredImageBlock,
} from "@/lib/appointment-doc";
import { EmailHtmlFrame } from "@/components/tickets/email-html-frame";
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
  width?: number;
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
  /** Quando o corpo jÃ¡ renderiza imagens inline, nÃ£o repetir nos chips. */
  skipInlineDocImages: boolean,
): ImagePreview[] {
  if (isAppointmentDoc(description)) {
    if (skipInlineDocImages) return [];
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
          width: block.width,
        });
      }
      if (result.length > 0) return result;
    }
  }

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

function InlineDocImage({
  block,
  attachments,
}: {
  block: StoredImageBlock;
  attachments: Attachment[];
}) {
  const attachment = resolveImageAttachment(
    block.fileIndex,
    block.fileId,
    attachments,
  );
  const src = block.dataUrl ?? attachment?.previewDataUrl ?? null;
  if (!src) return null;

  return (
    <AppointmentImageChip
      fileId={attachment?.fileId}
      filename={attachment?.originalName ?? "Print"}
      previewDataUrl={src}
      variant="inline"
      className="my-2"
    />
  );
}

function FullDescriptionBody({
  description,
  attachments,
}: {
  description: string;
  attachments: Attachment[];
}) {
  if (isAppointmentDoc(description)) {
    const doc = parseAppointmentDoc(description);
    if (!doc) {
      return (
        <p className="whitespace-pre-wrap break-words text-foreground/90 [overflow-wrap:anywhere]">
          {description}
        </p>
      );
    }
    return (
      <div className="space-y-2">
        {doc.blocks.map((block, index) => {
          if (block.type === "text") {
            if (block.html) {
              return (
                <div
                  key={`text-${index}`}
                  className={cn(
                    "text-foreground/90",
                    COMPOSER_HTML_CLASS,
                  )}
                  dangerouslySetInnerHTML={{ __html: block.content }}
                />
              );
            }
            return (
              <p
                key={`text-${index}`}
                className="whitespace-pre-wrap break-words text-foreground/90 [overflow-wrap:anywhere]"
              >
                {block.content}
              </p>
            );
          }
          return (
            <InlineDocImage
              key={`img-${index}`}
              block={block}
              attachments={attachments}
            />
          );
        })}
      </div>
    );
  }

  if (looksLikeHtml(description)) {
    // HTML aqui vem de e-mail externo (o prÃ©-ticket grava o corpo cru e a
    // descriÃ§Ã£o do ticket herda), ou seja: conteÃºdo de remetente nÃ£o
    // autenticado. Renderizar com dangerouslySetInnerHTML deixava a proteÃ§Ã£o
    // toda por conta da CSP â€” e `script-src-attr 'none'`, que bloqueia
    // onerror/onload, nÃ£o existe no Safari.
    //
    // O iframe sandbox (sem allow-scripts) Ã© o mesmo componente que a tela de
    // prÃ©-tickets jÃ¡ usa. Preserva a aparÃªncia do e-mail â€” imagens, tabelas,
    // assinatura â€” em vez de remover tags, e nada ali executa.
    return <EmailHtmlFrame html={description} />;
  }

  return (
    <p className="whitespace-pre-wrap break-words text-foreground/90 [overflow-wrap:anywhere]">
      {description}
    </p>
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
    } else if (looksLikeHtml(text)) {
      plainText = stripHtmlToPlain(text);
    } else {
      plainText = appointmentDescriptionToPlainText(text);
    }
  }

  const isDoc = Boolean(text && isAppointmentDoc(text));
  const imagePreviews = text
    ? collectImagePreviews(text, attachments, isDoc)
    : [];

  const isHtml = Boolean(text && looksLikeHtml(text));
  const hasHtmlImages =
    isHtml &&
    (/<img[\s\S]*src\s*=/i.test(text!) || text!.includes("data:image/"));
  const hasLongText = Boolean(plainText && isLongText(plainText));
  const showCollapsed = hasLongText && !expanded && !hasHtmlImages && !isDoc;

  if (!text) {
    return <span className="text-muted-foreground">â€”</span>;
  }

  const showDescriptionBody = Boolean(plainText) || isHtml || isDoc;

  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {showDescriptionBody ? (
        <div>
          {showCollapsed ? (
            <p className="line-clamp-3 whitespace-pre-wrap break-words text-foreground/90 [overflow-wrap:anywhere]">
              {plainText}
            </p>
          ) : (
            <FullDescriptionBody description={text} attachments={attachments} />
          )}
          {hasLongText && !hasHtmlImages && !isDoc ? (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className={cn(
                "mt-0.5 text-xs text-muted-foreground underline-offset-2",
                "hover:text-foreground hover:underline",
              )}
            >
              {expanded ? "Recolher descriÃ§Ã£o" : "DescriÃ§Ã£o completa"}
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
