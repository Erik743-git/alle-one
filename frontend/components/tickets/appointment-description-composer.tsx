"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Paperclip } from "lucide-react";
import { AppointmentImageChip } from "@/components/tickets/appointment-image-chip";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  serializeAppointmentDoc,
  type StoredBlock,
} from "@/lib/appointment-doc";
import { cn } from "@/lib/utils";

const MAX_IMAGES = 10;

type TextBlock = { type: "text"; id: string; content: string };
type ImageBlock = { type: "image"; id: string; fileKey: string };
type EditorBlock = TextBlock | ImageBlock;

export type AppointmentBlockComposerHandle = {
  exportContent: () => {
    description: string;
    files: File[];
    isValid: boolean;
  };
};

type Props = {
  disabled?: boolean;
  labelClassName?: string;
};

function newId() {
  return crypto.randomUUID();
}

function normalizePastedFile(file: File, index: number): File {
  const hasName = file.name && file.name !== "image.png" && file.name !== "blob";
  if (hasName) return file;
  const ext = (file.type.split("/")[1] || "png").replace("jpeg", "jpg");
  return new File([file], `print-${Date.now()}-${index}.${ext}`, { type: file.type });
}

function countImages(blocks: EditorBlock[]) {
  return blocks.filter((b) => b.type === "image").length;
}

function compactBlocks(blocks: EditorBlock[]): EditorBlock[] {
  const result: EditorBlock[] = [];
  for (const block of blocks) {
    if (block.type === "text") {
      const prev = result[result.length - 1];
      if (prev?.type === "text") {
        prev.content += block.content;
        continue;
      }
      result.push({ ...block });
      continue;
    }
    result.push(block);
  }
  return result;
}

export const AppointmentDescriptionComposer = forwardRef<
  AppointmentBlockComposerHandle,
  Props
>(function AppointmentDescriptionComposer({ disabled = false, labelClassName }, ref) {
  const [blocks, setBlocks] = useState<EditorBlock[]>([
    { type: "text", id: newId(), content: "" },
  ]);
  const [dragOver, setDragOver] = useState(false);
  const filesRef = useRef<Map<string, File>>(new Map());
  const previewUrlsRef = useRef<Map<string, string>>(new Map());
  const [, bumpPreview] = useState(0);

  const ensurePreview = useCallback((fileKey: string, file: File) => {
    if (!previewUrlsRef.current.has(fileKey) && file.type.startsWith("image/")) {
      previewUrlsRef.current.set(fileKey, URL.createObjectURL(file));
      bumpPreview((n) => n + 1);
    }
    return previewUrlsRef.current.get(fileKey);
  }, []);

  useEffect(() => {
    const activeKeys = new Set(
      blocks.filter((b) => b.type === "image").map((b) => b.fileKey),
    );
    for (const [key, url] of previewUrlsRef.current.entries()) {
      if (!activeKeys.has(key)) {
        URL.revokeObjectURL(url);
        previewUrlsRef.current.delete(key);
      }
    }
  }, [blocks]);

  useEffect(() => {
    const previews = previewUrlsRef.current;
    return () => {
      for (const url of previews.values()) URL.revokeObjectURL(url);
      previews.clear();
    };
  }, []);

  function updateTextBlock(id: string, content: string) {
    setBlocks((prev) =>
      prev.map((block) => (block.id === id && block.type === "text" ? { ...block, content } : block)),
    );
  }

  function insertImageInTextBlock(
    blockId: string,
    selectionStart: number,
    selectionEnd: number,
    file: File,
  ) {
    if (countImages(blocks) >= MAX_IMAGES) return;

    const fileKey = newId();
    filesRef.current.set(fileKey, normalizePastedFile(file, countImages(blocks)));

    setBlocks((prev) => {
      const index = prev.findIndex((b) => b.id === blockId);
      if (index === -1 || prev[index].type !== "text") return prev;

      const text = prev[index].content;
      const before = text.slice(0, selectionStart);
      const after = text.slice(selectionEnd);

      const inserted: EditorBlock[] = [];
      if (before) inserted.push({ type: "text", id: newId(), content: before });
      inserted.push({ type: "image", id: newId(), fileKey });
      inserted.push({ type: "text", id: newId(), content: after });

      return compactBlocks([...prev.slice(0, index), ...inserted, ...prev.slice(index + 1)]);
    });
  }

  function appendImageBlock(file: File) {
    if (countImages(blocks) >= MAX_IMAGES) return;

    const fileKey = newId();
    filesRef.current.set(fileKey, normalizePastedFile(file, countImages(blocks)));

    setBlocks((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.type === "text" && !last.content.trim()) {
        next.pop();
      }
      next.push({ type: "image", id: newId(), fileKey });
      next.push({ type: "text", id: newId(), content: "" });
      return next;
    });
  }

  function removeImageBlock(blockId: string) {
    setBlocks((prev) => {
      const index = prev.findIndex((b) => b.id === blockId);
      if (index === -1) return prev;
      const block = prev[index];
      if (block.type !== "image") return prev;
      filesRef.current.delete(block.fileKey);
      const next = prev.filter((b) => b.id !== blockId);
      if (!next.some((b) => b.type === "text")) {
        next.push({ type: "text", id: newId(), content: "" });
      }
      return compactBlocks(next);
    });
  }

  function handlePasteOnText(
    event: React.ClipboardEvent<HTMLTextAreaElement>,
    blockId: string,
  ) {
    const items = event.clipboardData?.items;
    if (!items?.length) return;

    for (const item of items) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (!file) continue;
        event.preventDefault();
        const target = event.currentTarget;
        insertImageInTextBlock(
          blockId,
          target.selectionStart ?? target.value.length,
          target.selectionEnd ?? target.value.length,
          file,
        );
        return;
      }
    }
  }

  function addFilesFromList(list: FileList | File[]) {
    const images = Array.from(list).filter((f) => f.type.startsWith("image/"));
    const others = Array.from(list).filter(
      (f) => !f.type.startsWith("image/") && f.type !== "",
    );
    for (const image of images) appendImageBlock(image);
    for (const other of others) appendImageBlock(other);
  }

  useImperativeHandle(ref, () => ({
    exportContent: () => {
      const storedBlocks: StoredBlock[] = [];
      const files: File[] = [];

      for (const block of blocks) {
        if (block.type === "text") {
          if (!block.content.trim()) continue;
          storedBlocks.push({ type: "text", content: block.content });
          continue;
        }
        const file = filesRef.current.get(block.fileKey);
        if (!file) continue;
        storedBlocks.push({ type: "image", fileIndex: files.length });
        files.push(file);
      }

      const hasText = storedBlocks.some((b) => b.type === "text");
      const hasImage = storedBlocks.some((b) => b.type === "image");
      const isValid = hasText || hasImage;

      return {
        description: isValid ? serializeAppointmentDoc(storedBlocks) : "",
        files,
        isValid,
      };
    },
  }));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className={labelClassName}>Descrição *</Label>
        <span className="text-xs text-muted-foreground">
          Escreva, cole print (Ctrl+V) no meio do texto, continue escrevendo
        </span>
      </div>

      <div
        onDragEnter={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (disabled) return;
          addFilesFromList(e.dataTransfer.files ?? []);
        }}
        className={cn(
          "space-y-3 rounded-xl border bg-muted/20 p-3 transition-colors",
          dragOver ? "border-primary ring-2 ring-primary/20" : "border-border",
        )}
      >
        {blocks.map((block) => {
          if (block.type === "text") {
            return (
              <Textarea
                key={block.id}
                rows={3}
                value={block.content}
                onChange={(e) => updateTextBlock(block.id, e.target.value)}
                onPaste={(e) => handlePasteOnText(e, block.id)}
                disabled={disabled}
                placeholder="Descreva o que foi feito neste trecho…"
                className="min-h-[72px] resize-y font-sans text-sm"
              />
            );
          }

          const file = filesRef.current.get(block.fileKey);
          const preview = file ? ensurePreview(block.fileKey, file) : null;

          return (
            <div key={block.id} className="py-0.5">
              <AppointmentImageChip
                filename={file?.name ?? "print.png"}
                localPreviewUrl={preview}
                localFile={file}
                disabled={disabled}
                onRemove={() => removeImageBlock(block.id)}
              />
            </div>
          );
        })}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2">
          <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" disabled={disabled} asChild>
            <label className="cursor-pointer">
              <Paperclip className="mr-1.5 size-3.5" />
              Inserir imagem no final
              <input
                type="file"
                multiple
                accept="image/*,application/pdf"
                className="sr-only"
                disabled={disabled}
                onChange={(e) => {
                  addFilesFromList(e.target.files ?? []);
                  e.target.value = "";
                }}
              />
            </label>
          </Button>
          <span className="text-[11px] text-muted-foreground">
            {countImages(blocks)}/{MAX_IMAGES} imagens · ordem preservada no apontamento
          </span>
        </div>
      </div>
    </div>
  );
});
