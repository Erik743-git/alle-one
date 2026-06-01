"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { notifyError } from "@/lib/notify";
import { inventarioService } from "@/lib/services/inventario.service";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  fileId: string | null;
  fileName?: string;
};

export function InventoryAttachmentPreviewDialog({
  open,
  onOpenChange,
  companyId,
  fileId,
  fileName,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState("");
  const [filename, setFilename] = useState(fileName ?? "Anexo");

  useEffect(() => {
    if (!open || !fileId || !companyId) return;

    const attachmentFileId = fileId;
    const attachmentCompanyId = companyId;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const res = await inventarioService.fetchAttachment({
          fileId: attachmentFileId,
          companyId: attachmentCompanyId,
          inline: true,
        });
        if (cancelled) return;
        const url = URL.createObjectURL(res.blob);
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
        setMimeType(res.mimeType);
        setFilename(res.filename);
      } catch (err) {
        if (!cancelled) {
          notifyError(
            err instanceof Error ? err.message : "Não foi possível abrir o anexo.",
          );
          onOpenChange(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [open, fileId, companyId, onOpenChange]);

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setMimeType("");
    }
  }

  async function handleDownload() {
    if (!fileId || !companyId) return;
    try {
      const res = await inventarioService.fetchAttachment({
        fileId,
        companyId,
        inline: false,
      });
      const url = URL.createObjectURL(res.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Falha ao baixar o anexo.");
    }
  }

  const previewKind = useMemo(() => {
    if (loading || !previewUrl) return "loading" as const;
    const mt = mimeType.toLowerCase();
    if (mt.startsWith("image/")) return "image" as const;
    if (mt === "application/pdf" || filename.toLowerCase().endsWith(".pdf")) {
      return "pdf" as const;
    }
    return "unsupported" as const;
  }, [loading, previewUrl, mimeType, filename]);

  const isPdf = previewKind === "pdf";
  const isImage = previewKind === "image";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          "font-sans gap-4 border border-border bg-card text-card-foreground",
          isPdf
            ? "max-w-[95vw] sm:max-w-5xl"
            : "max-w-[95vw] w-fit sm:max-w-[min(92vw,42rem)]",
        )}
      >
        <DialogHeader className="pr-8">
          <DialogTitle className="font-sans truncate">{filename}</DialogTitle>
          <DialogDescription className="font-sans text-muted-foreground">
            Pré-visualização do anexo do inventário.
          </DialogDescription>
        </DialogHeader>

        <div
          className={cn(
            "overflow-auto rounded-xl border border-border bg-muted/25",
            isPdf && "h-[min(75vh,820px)]",
            isImage &&
              "flex min-h-[8rem] max-h-[min(70vh,720px)] items-center justify-center p-4 sm:p-5",
            previewKind === "loading" &&
              "flex min-h-[9rem] items-center justify-center",
            previewKind === "unsupported" &&
              "flex min-h-[9rem] items-center justify-center px-4 py-6",
          )}
        >
          {previewKind === "loading" ? (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Carregando…
            </div>
          ) : isImage && previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={filename}
              className="block max-h-[min(65vh,640px)] max-w-full object-contain rounded-md shadow-sm"
            />
          ) : isPdf && previewUrl ? (
            <iframe title={filename} src={previewUrl} className="h-full w-full min-h-[60vh]" />
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              Visualização não disponível para este tipo de arquivo.
            </p>
          )}
        </div>

        {previewUrl && !loading ? (
          <div className="flex justify-end pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => void handleDownload()}>
              <Download className="h-4 w-4 mr-2" />
              Baixar
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
