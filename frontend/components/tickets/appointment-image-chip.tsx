"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, ImageIcon, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ZoomableImagePreview } from "@/components/ui/zoomable-image-preview";
import { blobToDataUrl, fileToDataUrl } from "@/lib/blob-to-data-url";
import { ticketsService } from "@/lib/services/tickets.service";
import { cn } from "@/lib/utils";

type Props = {
  filename: string;
  fileId?: string;
  previewDataUrl?: string | null;
  localPreviewUrl?: string | null;
  localFile?: File | null;
  onRemove?: () => void;
  disabled?: boolean;
  className?: string;
  variant?: "chip" | "thumbnail" | "inline";
};

function isLikelyImageBlob(blob: Blob, mimeType: string, filename: string) {
  if (blob.size < 12) return false;
  const type = (blob.type || mimeType || "").toLowerCase();
  if (type.startsWith("image/")) return true;
  const lower = filename.toLowerCase();
  return (
    lower.endsWith(".png") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".webp") ||
    lower.endsWith(".gif")
  );
}

export function AppointmentImageChip({
  filename,
  fileId,
  previewDataUrl,
  localPreviewUrl,
  localFile,
  onRemove,
  disabled = false,
  className,
  variant = "chip",
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [thumbSrc, setThumbSrc] = useState<string | null>(null);
  const [thumbLoading, setThumbLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const thumbLoadedRef = useRef(false);

  const resetPreview = useCallback(() => {
    setPreviewSrc(null);
    setError(null);
    setLoading(false);
  }, []);

  async function resolvePreviewSrc(): Promise<string> {
    if (localFile) {
      return fileToDataUrl(localFile);
    }

    if (localPreviewUrl) {
      const response = await fetch(localPreviewUrl);
      const blob = await response.blob();
      return blobToDataUrl(blob);
    }

    if (!fileId) {
      throw new Error("Imagem indisponível.");
    }

    const { blob, mimeType } = await ticketsService.fetchAttachment({
      fileId,
      inline: true,
    });

    if (!isLikelyImageBlob(blob, mimeType, filename)) {
      throw new Error("O anexo não é uma imagem válida ou está vazio.");
    }

    const type =
      blob.type ||
      mimeType ||
      (filename.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg");
    const imageBlob = blob.type ? blob : new Blob([blob], { type });
    return blobToDataUrl(imageBlob);
  }

  useEffect(() => {
    if (previewDataUrl) {
      setThumbSrc(previewDataUrl);
      return;
    }
    if (variant === "inline") {
      return;
    }
    if (variant !== "thumbnail" || thumbLoadedRef.current || disabled) return;
    if (localFile || localPreviewUrl) {
      thumbLoadedRef.current = true;
      void resolvePreviewSrc()
        .then(setThumbSrc)
        .catch(() => {
          /* fallback para ícone */
        });
      return;
    }
    if (!fileId) return;

    thumbLoadedRef.current = true;
    setThumbLoading(true);
    void resolvePreviewSrc()
      .then(setThumbSrc)
      .catch(() => {
        /* fallback para ícone */
      })
      .finally(() => setThumbLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, fileId, localFile, localPreviewUrl, disabled, previewDataUrl]);

  async function handleOpen() {
    if (disabled) return;
    setOpen(true);
    setLoading(true);
    setError(null);
    const immediate = previewDataUrl ?? thumbSrc;
    setPreviewSrc(immediate);

    if (immediate) {
      setLoading(false);
      return;
    }

    try {
      const dataUrl = await resolvePreviewSrc();
      setPreviewSrc(dataUrl);
      setThumbSrc(dataUrl);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Não foi possível carregar a imagem.",
      );
    } finally {
      setLoading(false);
    }
  }

  function handleClose(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) resetPreview();
  }

  async function handleDownload() {
    try {
      if (localFile) {
        const url = URL.createObjectURL(localFile);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename || localFile.name;
        anchor.click();
        URL.revokeObjectURL(url);
        return;
      }
      if (!fileId) return;
      const { blob, filename: downloadedName } = await ticketsService.fetchAttachment({
        fileId,
        inline: false,
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = downloadedName || filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Não foi possível baixar a imagem.");
    }
  }

  const trigger =
    variant === "inline" ? (
      <button
        type="button"
        disabled={disabled}
        onClick={() => void handleOpen()}
        className={cn(
          "block max-w-full cursor-zoom-in overflow-hidden rounded-md border border-border/50 bg-muted/20 transition",
          "hover:border-primary/50 hover:ring-2 hover:ring-primary/20",
          disabled && "pointer-events-none opacity-50",
          className,
        )}
        title={filename || "Ver imagem"}
      >
        {thumbSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbSrc}
            alt={filename || "Imagem"}
            className="h-auto max-h-[360px] w-auto max-w-full object-contain"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewDataUrl ?? ""}
            alt={filename || "Imagem"}
            className="h-auto max-h-[360px] w-auto max-w-full object-contain"
          />
        )}
      </button>
    ) : variant === "thumbnail" ? (
      <button
        type="button"
        disabled={disabled}
        onClick={() => void handleOpen()}
        className={cn(
          "relative h-28 w-44 shrink-0 overflow-hidden rounded-md border border-border bg-muted/30",
          "transition hover:border-primary/50 hover:ring-2 hover:ring-primary/20",
          disabled && "pointer-events-none opacity-50",
          className,
        )}
        title={filename || "Ver print"}
      >
        {thumbLoading ? (
          <span className="flex h-full w-full items-center justify-center">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </span>
        ) : thumbSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbSrc}
            alt={filename || "Print"}
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="flex h-full w-full flex-col items-center justify-center gap-0.5 text-muted-foreground">
            <ImageIcon className="size-4" />
            <span className="text-[10px] font-medium">Print</span>
          </span>
        )}
      </button>
    ) : (
      <button
        type="button"
        disabled={disabled}
        onClick={() => void handleOpen()}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 text-xs font-medium text-foreground transition",
          "hover:border-primary/40 hover:bg-primary/10 hover:text-primary",
          disabled && "pointer-events-none opacity-50",
        )}
        title={filename || "Ver print"}
      >
        <ImageIcon className="size-3.5 shrink-0" />
        <span>Print</span>
      </button>
    );

  return (
    <>
      <span className={cn("inline-flex items-center gap-1 align-middle", className)}>
        {trigger}
        {onRemove ? (
          <button
            type="button"
            disabled={disabled}
            onClick={onRemove}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Remover imagem"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </span>

      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="flex max-h-[min(92vh,820px)] w-[min(96vw,900px)] max-w-[min(96vw,900px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,900px)]">
          <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-12">
            <DialogTitle className="truncate text-base font-semibold">
              {filename || "Print"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex min-h-[240px] flex-1 flex-col overflow-hidden bg-muted/20 p-6">
            {loading ? (
              <div className="flex flex-1 items-center justify-center">
                <Loader2 className="size-8 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <p className="max-w-md text-center text-sm text-destructive">{error}</p>
            ) : previewSrc ? (
              <ZoomableImagePreview
                src={previewSrc}
                alt={filename || "Print"}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma imagem para exibir.</p>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 pt-4 pb-6">
            <Button
              type="button"
              variant="outline"
              className="h-10 min-w-[96px]"
              onClick={() => handleClose(false)}
            >
              Fechar
            </Button>
            <Button
              type="button"
              variant="default"
              className="h-10 min-w-[110px]"
              onClick={() => void handleDownload()}
              disabled={loading || Boolean(error) || (!fileId && !localFile)}
            >
              <Download className="mr-2 size-4" />
              Baixar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
