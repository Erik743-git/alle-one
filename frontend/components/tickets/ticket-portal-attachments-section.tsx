"use client";

import { Download, Paperclip } from "lucide-react";

import { AppointmentImageChip } from "@/components/tickets/appointment-image-chip";
import { Button } from "@/components/ui/button";

export type TicketPortalAttachment = {
  id: string;
  fileId: string;
  originalName: string;
  mimeType: string;
  size: number;
  previewDataUrl: string | null;
};

type Props = {
  attachments: TicketPortalAttachment[];
  onDownload: (attachment: TicketPortalAttachment) => void | Promise<void>;
  formatFileSize: (bytes: number) => string;
};

export function TicketPortalAttachmentsSection({
  attachments,
  onDownload,
  formatFileSize,
}: Props) {
  if (!attachments.length) {
    return null;
  }

  const images = attachments.filter((item) =>
    (item.mimeType || "").startsWith("image/"),
  );
  const files = attachments.filter(
    (item) => !(item.mimeType || "").startsWith("image/"),
  );

  return (
    <section className="rounded-xl border border-border bg-card/50">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Paperclip className="size-3.5" />
          Anexos do ticket
        </h2>
        <span className="text-xs text-muted-foreground">
          {attachments.length} arquivo{attachments.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="space-y-4 px-4 py-3">
        {images.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {images.map((attachment) => (
              <AppointmentImageChip
                key={attachment.fileId}
                fileId={attachment.fileId}
                filename={attachment.originalName}
                previewDataUrl={attachment.previewDataUrl}
                variant="thumbnail"
              />
            ))}
          </div>
        ) : null}

        {files.length > 0 ? (
          <ul className={images.length > 0 ? "space-y-1.5 border-t border-border pt-4" : "space-y-1.5"}>
            {files.map((attachment) => (
              <li
                key={attachment.fileId}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">
                  {attachment.originalName}
                  <span className="text-muted-foreground">
                    {` · ${attachment.mimeType || "arquivo"}`}
                    {attachment.size != null
                      ? ` · ${formatFileSize(attachment.size)}`
                      : ""}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => void onDownload(attachment)}
                >
                  <Download className="mr-1.5 size-3.5" />
                  Baixar
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
