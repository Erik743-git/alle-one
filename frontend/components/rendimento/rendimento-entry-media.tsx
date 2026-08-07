"use client";

import { useMemo, useState } from "react";
import { Download, Loader2, Package } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  appointmentDescriptionToPlainText,
  isAppointmentDoc,
  parseAppointmentDoc,
} from "@/lib/appointment-doc";
import { notifyError } from "@/lib/notify";
import { ticketsService } from "@/lib/services/tickets.service";
import { cn } from "@/lib/utils";

type MediaAttachment = {
  fileId: string;
  originalName: string;
  mimeType: string;
  previewDataUrl?: string | null;
  size?: number;
};

type Props = {
  ticketNumber: number;
  description?: string | null;
  hasMedia?: boolean;
  portalAppointmentId?: string | null;
  /** Só o ícone + dialog (para colocar à direita do título). */
  iconOnly?: boolean;
  className?: string;
};

/** Texto limpo da descrição para exibir no card (sem JSON/base64). */
export function rendimentoEntryPlainText(
  description?: string | null,
): string {
  const raw = description?.trim() ?? "";
  if (!raw) return "";
  const plain = isAppointmentDoc(raw)
    ? appointmentDescriptionToPlainText(raw)
    : raw;
  return plain.replace(/\[imagem\]/gi, "").replace(/\s+/g, " ").trim();
}

function formatSize(size?: number) {
  if (size == null) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

async function downloadFile(attachment: MediaAttachment) {
  const { blob, filename, mimeType } = await ticketsService.fetchAttachment({
    fileId: attachment.fileId,
    inline: false,
  });
  const url = URL.createObjectURL(new Blob([blob], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename || attachment.originalName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function RendimentoEntryMedia({
  ticketNumber,
  description,
  hasMedia = false,
  portalAppointmentId,
  iconOnly = false,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fullDescription, setFullDescription] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<MediaAttachment[]>([]);

  const plain = useMemo(() => {
    const raw = description?.trim() ?? "";
    if (!raw) return "";
    if (isAppointmentDoc(raw)) {
      return appointmentDescriptionToPlainText(raw);
    }
    return raw;
  }, [description]);

  const showButton = hasMedia;

  async function openMedia() {
    setOpen(true);
    if (!portalAppointmentId) {
      setFullDescription(description ?? null);
      setAttachments([]);
      return;
    }
    try {
      setLoading(true);
      const ctx = await ticketsService.appointmentEditContext(
        ticketNumber,
        portalAppointmentId,
      );
      setFullDescription(ctx.description);
      setAttachments(ctx.attachments ?? []);
    } catch (err) {
      notifyError(
        err instanceof Error
          ? err.message
          : "Não foi possível carregar anexos do apontamento.",
      );
      setFullDescription(description ?? null);
      setAttachments([]);
    } finally {
      setLoading(false);
    }
  }

  const images = useMemo(() => {
    const items: Array<{
      key: string;
      fileId?: string;
      name: string;
      previewDataUrl?: string | null;
    }> = [];
    const raw = fullDescription?.trim() ?? "";
    if (raw && isAppointmentDoc(raw)) {
      const doc = parseAppointmentDoc(raw);
      for (const [index, block] of (doc?.blocks ?? []).entries()) {
        if (block.type !== "image") continue;
        const attachment =
          (block.fileId
            ? attachments.find((a) => a.fileId === block.fileId)
            : undefined) ??
          attachments.filter((a) => a.mimeType.startsWith("image/"))[
            block.fileIndex
          ];
        items.push({
          key: block.fileId ?? `img-${index}`,
          fileId: block.fileId ?? attachment?.fileId,
          name: attachment?.originalName ?? `Imagem ${index + 1}`,
          previewDataUrl: block.dataUrl ?? attachment?.previewDataUrl,
        });
      }
    }
    for (const attachment of attachments) {
      if (!attachment.mimeType.startsWith("image/")) continue;
      if (items.some((item) => item.fileId === attachment.fileId)) continue;
      items.push({
        key: attachment.fileId,
        fileId: attachment.fileId,
        name: attachment.originalName,
        previewDataUrl: attachment.previewDataUrl,
      });
    }
    return items;
  }, [attachments, fullDescription]);

  const files = attachments.filter(
    (item) => !(item.mimeType || "").startsWith("image/"),
  );

  const textBody = useMemo(() => {
    const raw = fullDescription?.trim() ?? plain;
    if (!raw) return "";
    if (isAppointmentDoc(raw)) {
      return appointmentDescriptionToPlainText(raw)
        .replace(/\[imagem\]/gi, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }
    return raw;
  }, [fullDescription, plain]);

  const listText = rendimentoEntryPlainText(description);

  const mediaButton = showButton ? (
    <Button
      type="button"
      size="icon"
      variant="outline"
      className="size-7 shrink-0"
      title="Ver imagens e anexos"
      aria-label="Ver imagens e anexos"
      onClick={(event) => {
        event.stopPropagation();
        void openMedia();
      }}
    >
      <Package className="size-3.5" />
    </Button>
  ) : null;

  const mediaDialog = (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Anexos do apontamento</DialogTitle>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Carregando…
            </div>
          ) : (
            <div className="space-y-4">
              {textBody ? (
                <p className="whitespace-pre-wrap text-sm text-foreground/90">
                  {textBody}
                </p>
              ) : null}

              {images.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">
                    Imagens
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {images.map((image) => (
                      <div
                        key={image.key}
                        className="overflow-hidden rounded-lg border bg-muted/20"
                      >
                        {image.previewDataUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={image.previewDataUrl}
                            alt={image.name}
                            className="max-h-56 w-full object-contain bg-background"
                          />
                        ) : (
                          <div className="flex h-28 items-center justify-center text-xs text-muted-foreground">
                            Sem preview
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                          <span className="truncate text-xs">{image.name}</span>
                          {image.fileId ? (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-7"
                              title="Baixar"
                              onClick={() =>
                                void downloadFile({
                                  fileId: image.fileId!,
                                  originalName: image.name,
                                  mimeType: "image/png",
                                }).catch((err) =>
                                  notifyError(
                                    err instanceof Error
                                      ? err.message
                                      : "Falha ao baixar.",
                                  ),
                                )
                              }
                            >
                              <Download className="size-3.5" />
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {files.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">
                    Arquivos
                  </p>
                  <ul className="space-y-1.5">
                    {files.map((file) => (
                      <li
                        key={file.fileId}
                        className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                      >
                        <Package className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">
                          {file.originalName}
                          <span className="text-muted-foreground">
                            {file.size != null
                              ? ` · ${formatSize(file.size)}`
                              : ""}
                          </span>
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() =>
                            void downloadFile(file).catch((err) =>
                              notifyError(
                                err instanceof Error
                                  ? err.message
                                  : "Falha ao baixar.",
                              ),
                            )
                          }
                        >
                          <Download className="mr-1.5 size-3.5" />
                          Baixar
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {!textBody && images.length === 0 && files.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhum conteúdo para exibir.
                </p>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>
  );

  if (iconOnly) {
    if (!showButton) return null;
    return (
      <span className={cn("inline-flex", className)}>
        {mediaButton}
        {mediaDialog}
      </span>
    );
  }

  if (!listText && !showButton) return null;

  return (
    <div className={cn("mt-1 flex items-start gap-2", className)}>
      {listText ? (
        <p className="min-w-0 flex-1 text-sm text-foreground/80 line-clamp-2">
          {listText}
        </p>
      ) : null}
      {mediaButton}
      {mediaDialog}
    </div>
  );
}
