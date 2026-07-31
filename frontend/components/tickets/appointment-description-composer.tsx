"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
} from "react";
import { FileText, Paperclip, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/field-label";
import {
  isAppointmentDoc,
  parseAppointmentDoc,
  serializeAppointmentDoc,
  type StoredBlock,
} from "@/lib/appointment-doc";
import { cn } from "@/lib/utils";

const MAX_ATTACHMENTS = 10;
/** Largura padrão dos prints no editor (cabem bem na tela). */
const DEFAULT_IMAGE_WIDTH = 280;
const MAX_IMAGE_WIDTH = 360;

type AttachmentItem = {
  id: string;
  file: File;
};

export type AppointmentBlockComposerHandle = {
  exportContent: () => {
    description: string;
    files: File[];
    isValid: boolean;
    removeAttachmentFileIds: string[];
  };
};

type Props = {
  disabled?: boolean;
  labelClassName?: string;
  placeholder?: string;
  hintText?: string;
  appendButtonLabel?: string;
  /** Exibe * vermelho padrão (FieldLabel). Default true. */
  required?: boolean;
  /** Descrição já salva (texto, HTML de e-mail ou doc Alle One) para pré-carregar o editor. */
  initialDescription?: string | null;
  /** Anexos existentes do ticket (imagens reidratam na descrição; outros aparecem em Anexos). */
  initialAttachments?: Array<{
    fileId: string;
    originalName: string;
    mimeType: string;
    previewDataUrl?: string | null;
    size?: number;
  }>;
};

function newId() {
  return crypto.randomUUID();
}

function normalizePastedFile(file: File, index: number): File {
  const hasName =
    file.name &&
    file.name !== "image.png" &&
    file.name !== "blob";

  if (hasName) return file;

  const extension = (file.type.split("/")[1] || "png").replace(
    "jpeg",
    "jpg",
  );

  return new File(
    [file],
    `print-${Date.now()}-${index}.${extension}`,
    { type: file.type },
  );
}

function isBlockElement(element: HTMLElement) {
  return [
    "DIV",
    "P",
    "LI",
    "UL",
    "OL",
    "BLOCKQUOTE",
    "PRE",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
  ].includes(element.tagName);
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

async function dataUrlOrBlobUrlToFile(
  src: string,
  fileName: string,
  mimeHint?: string,
): Promise<File | null> {
  try {
    if (src.startsWith("data:")) {
      const match = /^data:([^;]+);base64,([\s\S]+)$/i.exec(src);
      if (match) {
        const mime = match[1] || mimeHint || "image/png";
        const binary = atob(match[2].replace(/\s/g, ""));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const extension = (mime.split("/")[1] || "png").replace("jpeg", "jpg");
        const safeName =
          fileName?.trim() && fileName !== "blob"
            ? fileName
            : `imagem-${Date.now()}.${extension}`;
        return new File([bytes], safeName, { type: mime });
      }
    }

    const response = await fetch(src);
    const blob = await response.blob();
    const type = blob.type || mimeHint || "image/png";
    const extension = (type.split("/")[1] || "png").replace("jpeg", "jpg");
    const safeName =
      fileName?.trim() && fileName !== "blob"
        ? fileName
        : `imagem-${Date.now()}.${extension}`;
    return new File([blob], safeName, { type });
  } catch {
    return null;
  }
}

function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function cleanEditorText(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[^\S\n]+/g, " ")
    .trim();
}

/** Extrai imagens e devolve HTML sanitizado (estrutura do e-mail) para o editor. */
function prepareEmailHtmlForEditor(html: string): {
  bodyHtml: string;
  images: Array<{ src: string; alt: string }>;
} {
  const temp = document.createElement("div");
  temp.innerHTML = html;

  const images = Array.from(temp.querySelectorAll("img[src]")).map((img) => ({
    src: img.getAttribute("src")?.trim() ?? "",
    alt: img.getAttribute("alt")?.trim() || "imagem",
  }));

  temp
    .querySelectorAll(
      "img, script, style, noscript, head, link, meta, iframe, object, embed",
    )
    .forEach((el) => el.remove());

  temp.querySelectorAll("*").forEach((node) => {
    const el = node as HTMLElement;
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (
        name.startsWith("on") ||
        name === "style" ||
        name === "class" ||
        name === "id" ||
        name.startsWith("data-")
      ) {
        el.removeAttribute(attr.name);
      }
    }
  });

  return {
    bodyHtml: temp.innerHTML.trim(),
    images: images.filter((item) => item.src && !item.src.startsWith("cid:")),
  };
}

export const AppointmentDescriptionComposer = forwardRef<
  AppointmentBlockComposerHandle,
  Props
>(function AppointmentDescriptionComposer(
  {
    disabled = false,
    labelClassName,
    placeholder = "Descreva o que foi feito neste trecho…",
    hintText = "",
    appendButtonLabel = "Anexar arquivo",
    required = true,
    initialDescription = null,
    initialAttachments = [],
  },
  ref,
) {
  const editorRef = useRef<HTMLDivElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const hydratingRef = useRef(false);
  const [editorReady, setEditorReady] = useState(false);

  const inlineFilesRef = useRef<Map<string, File>>(new Map());
  const previewUrlsRef = useRef<Map<string, string>>(new Map());
  const lastSelectionRef = useRef<Range | null>(null);

  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [removedExistingIds, setRemovedExistingIds] = useState<string[]>([]);

  const existingFileAttachments = initialAttachments.filter(
    (item) =>
      !(item.mimeType || "").startsWith("image/") &&
      !removedExistingIds.includes(item.fileId),
  );

  const setEditorNode = useCallback((node: HTMLDivElement | null) => {
    editorRef.current = node;
    setEditorReady(Boolean(node));
  }, []);

  const saveSelection = useCallback(() => {
    const editor = editorRef.current;
    const selection = window.getSelection();

    if (!editor || !selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);

    if (!editor.contains(range.commonAncestorContainer)) return;

    lastSelectionRef.current = range.cloneRange();
  }, []);

  const focusEditorAtEnd = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.focus();

    const selection = window.getSelection();
    if (!selection) return;

    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);

    selection.removeAllRanges();
    selection.addRange(range);
    lastSelectionRef.current = range.cloneRange();
  }, []);

  const restoreSelection = useCallback(() => {
    const editor = editorRef.current;
    const selection = window.getSelection();

    if (!editor || !selection) return;

    const savedRange = lastSelectionRef.current;

    if (
      savedRange &&
      editor.contains(savedRange.commonAncestorContainer)
    ) {
      selection.removeAllRanges();
      selection.addRange(savedRange);
      return;
    }

    focusEditorAtEnd();
  }, [focusEditorAtEnd]);

  const syncInlineImagesWithDom = useCallback(() => {
    if (hydratingRef.current) return;
    const editor = editorRef.current;
    if (!editor) return;

    const activeKeys = new Set(
      Array.from(
        editor.querySelectorAll<HTMLElement>(
          "[data-appointment-image][data-file-key]",
        ),
      )
        .map((element) => element.dataset.fileKey)
        .filter((key): key is string => Boolean(key)),
    );

    for (const key of inlineFilesRef.current.keys()) {
      if (activeKeys.has(key)) continue;

      inlineFilesRef.current.delete(key);

      const previewUrl = previewUrlsRef.current.get(key);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        previewUrlsRef.current.delete(key);
      }
    }

  }, []);

  const removeImageByKey = useCallback(
    (fileKey: string) => {
      const editor = editorRef.current;
      if (!editor) return;

      const wrapper = editor.querySelector<HTMLElement>(
        `[data-appointment-image][data-file-key="${fileKey}"]`,
      );

      if (!wrapper) {
        syncInlineImagesWithDom();
        return;
      }

      const nextNode = wrapper.nextSibling;
      wrapper.remove();

      inlineFilesRef.current.delete(fileKey);

      const previewUrl = previewUrlsRef.current.get(fileKey);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        previewUrlsRef.current.delete(fileKey);
      }

      editor.focus();

      if (nextNode) {
        const selection = window.getSelection();

        if (selection) {
          const range = document.createRange();
          range.setStart(nextNode, 0);
          range.collapse(true);

          selection.removeAllRanges();
          selection.addRange(range);
          lastSelectionRef.current = range.cloneRange();
        }
      } else {
        focusEditorAtEnd();
      }
    },
    [focusEditorAtEnd, syncInlineImagesWithDom],
  );

  const createImageElement = useCallback(
    (fileKey: string, file: File, previewUrl: string) => {
      const wrapper = document.createElement("span");

      wrapper.dataset.appointmentImage = "true";
      wrapper.dataset.fileKey = fileKey;
      wrapper.contentEditable = "false";
      wrapper.className =
        "group relative my-3 inline-block max-w-full align-top";
      wrapper.style.width = `${DEFAULT_IMAGE_WIDTH}px`;
      wrapper.style.minWidth = "96px";
      wrapper.style.maxWidth = `min(100%, ${MAX_IMAGE_WIDTH}px)`;
      wrapper.style.lineHeight = "0";

      const image = document.createElement("img");

      image.src = previewUrl;
      image.alt = file.name || "Imagem colada";
      image.draggable = false;
      image.className = "block h-auto max-w-full select-none rounded-md border border-border/50";
      image.style.width = "100%";
      image.style.height = "auto";
      image.style.maxHeight = "280px";
      image.style.objectFit = "contain";

      const removeButton = document.createElement("button");

      removeButton.type = "button";
      removeButton.dataset.removeImage = fileKey;
      removeButton.setAttribute("aria-label", "Remover imagem");
      removeButton.className =
        "absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-md bg-destructive text-destructive-foreground opacity-0 shadow transition-opacity group-hover:opacity-100 focus:opacity-100";
      removeButton.innerHTML =
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';

      const resizeHandle = document.createElement("button");

      resizeHandle.type = "button";
      resizeHandle.tabIndex = -1;
      resizeHandle.dataset.resizeImage = fileKey;
      resizeHandle.setAttribute(
        "aria-label",
        "Redimensionar imagem",
      );
      resizeHandle.className =
        "absolute bottom-0 right-0 size-5 cursor-nwse-resize rounded-tl bg-foreground/55 opacity-0 transition-opacity group-hover:opacity-100";
      resizeHandle.innerHTML =
        '<svg viewBox="0 0 16 16" width="14" height="14" class="m-auto text-background" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 13h8V5"/><path d="M8 13l5-5"/></svg>';

      wrapper.append(image, removeButton, resizeHandle);

      return wrapper;
    },
    [],
  );

  useEffect(() => {
    if (!editorReady) return;
    const editor = editorRef.current;
    if (!editor) return;

    const raw = initialDescription?.trim() ?? "";
    const imageAttachments = initialAttachments.filter(
      (a) =>
        (a.mimeType || "").startsWith("image/") &&
        Boolean(a.previewDataUrl?.trim()),
    );
    if (!raw && imageAttachments.length === 0) return;

    let cancelled = false;
    hydratingRef.current = true;

    async function hydrate() {
      if (!editor || cancelled) return;
      editor.replaceChildren();
      inlineFilesRef.current.clear();
      for (const url of previewUrlsRef.current.values()) {
        URL.revokeObjectURL(url);
      }
      previewUrlsRef.current.clear();

      const seenImageKeys = new Set<string>();

      const appendText = (text: string) => {
        const normalized = cleanEditorText(text);
        if (!normalized) return;
        for (const line of normalized.split("\n")) {
          const div = document.createElement("div");
          div.textContent = line || "\u00a0";
          editor.appendChild(div);
        }
      };

      const appendImageFile = (file: File) => {
        const dedupeKey = `file:${file.type}:${file.size}:${file.name}`;
        if (seenImageKeys.has(dedupeKey)) return;
        seenImageKeys.add(dedupeKey);

        const fileKey = newId();
        const previewUrl = URL.createObjectURL(file);
        inlineFilesRef.current.set(fileKey, file);
        previewUrlsRef.current.set(fileKey, previewUrl);
        editor.appendChild(createImageElement(fileKey, file, previewUrl));
        const lineAfter = document.createElement("div");
        lineAfter.appendChild(document.createElement("br"));
        editor.appendChild(lineAfter);
      };

      const appendImageFromSrc = async (
        src: string,
        fileName: string,
        mimeType?: string,
      ) => {
        const trimmed = src.trim();
        if (!trimmed || trimmed.startsWith("cid:")) return;
        // Mesmo print embutido 2x no HTML do e-mail → uma só entrada.
        const fingerprint =
          trimmed.length > 96
            ? `${trimmed.slice(0, 48)}:${trimmed.length}:${trimmed.slice(-32)}`
            : trimmed;
        if (seenImageKeys.has(`src:${fingerprint}`)) return;

        const file = await dataUrlOrBlobUrlToFile(
          trimmed,
          fileName,
          mimeType,
        );
        if (!file || cancelled) return;
        seenImageKeys.add(`src:${fingerprint}`);
        appendImageFile(file);
      };

      if (raw && isAppointmentDoc(raw)) {
        const doc = parseAppointmentDoc(raw);
        if (doc) {
          for (const block of doc.blocks) {
            if (cancelled) return;
            if (block.type === "text") {
              appendText(block.content);
              continue;
            }
            if (block.type !== "image") continue;

            const attachment =
              (block.fileId
                ? imageAttachments.find((a) => a.fileId === block.fileId)
                : undefined) ?? imageAttachments[block.fileIndex];

            const src =
              block.dataUrl?.trim() ||
              attachment?.previewDataUrl?.trim() ||
              "";
            if (!src) continue;

            await appendImageFromSrc(
              src,
              attachment?.originalName || `imagem-${block.fileIndex + 1}.png`,
              attachment?.mimeType,
            );
          }
        } else {
          appendText(raw);
        }
        return;
      }

      if (raw && looksLikeHtml(raw)) {
        const prepared = prepareEmailHtmlForEditor(raw);
        if (prepared.bodyHtml) {
          editor.innerHTML = prepared.bodyHtml;
        } else {
          appendText(raw.replace(/<[^>]+>/g, " "));
        }

        for (const [index, img] of prepared.images.entries()) {
          if (cancelled) return;
          await appendImageFromSrc(
            img.src,
            img.alt || `imagem-email-${index + 1}.png`,
          );
        }
        return;
      } else if (raw) {
        appendText(raw);
      }

      for (const [index, attachment] of imageAttachments.entries()) {
        if (cancelled) return;
        const src = attachment.previewDataUrl?.trim();
        if (!src) continue;
        await appendImageFromSrc(
          src,
          attachment.originalName || `imagem-${index + 1}.png`,
          attachment.mimeType,
        );
      }
    }

    void hydrate().finally(() => {
      if (!cancelled) hydratingRef.current = false;
    });

    return () => {
      cancelled = true;
      hydratingRef.current = false;
    };
  }, [createImageElement, editorReady, initialAttachments, initialDescription]);

  const insertImageAtCaret = useCallback(
    (originalFile: File) => {
      const editor = editorRef.current;

      if (!editor || disabled) return;
      if (!originalFile.type.startsWith("image/")) return;

      syncInlineImagesWithDom();

      const fileKey = newId();
      const file = normalizePastedFile(
        originalFile,
        inlineFilesRef.current.size,
      );
      const previewUrl = URL.createObjectURL(file);

      inlineFilesRef.current.set(fileKey, file);
      previewUrlsRef.current.set(fileKey, previewUrl);

      editor.focus();
      restoreSelection();

      const selection = window.getSelection();

      if (!selection) {
        inlineFilesRef.current.delete(fileKey);
        previewUrlsRef.current.delete(fileKey);
        URL.revokeObjectURL(previewUrl);
        return;
      }

      let range: Range;

      if (
        selection.rangeCount > 0 &&
        editor.contains(
          selection.getRangeAt(0).commonAncestorContainer,
        )
      ) {
        range = selection.getRangeAt(0);
      } else {
        range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
      }

      range.deleteContents();

      const imageElement = createImageElement(
        fileKey,
        file,
        previewUrl,
      );

      const lineAfter = document.createElement("div");
      lineAfter.appendChild(document.createElement("br"));

      const fragment = document.createDocumentFragment();
      fragment.append(imageElement, lineAfter);

      range.insertNode(fragment);


      requestAnimationFrame(() => {
        editor.focus();

        const nextSelection = window.getSelection();
        if (!nextSelection) return;

        const nextRange = document.createRange();
        nextRange.setStart(lineAfter, 0);
        nextRange.collapse(true);

        nextSelection.removeAllRanges();
        nextSelection.addRange(nextRange);
        lastSelectionRef.current = nextRange.cloneRange();
      });
    },
    [
      createImageElement,
      disabled,
      restoreSelection,
      syncInlineImagesWithDom,
    ],
  );

  const handlePaste = useCallback(
    (event: ReactClipboardEvent<HTMLDivElement>) => {
      if (disabled) return;

      const imageFiles = Array.from(event.clipboardData.items)
        .filter(
          (item) =>
            item.kind === "file" &&
            item.type.startsWith("image/"),
        )
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));

      if (imageFiles.length === 0) return;

      event.preventDefault();

      syncInlineImagesWithDom();

      imageFiles.forEach((file) => insertImageAtCaret(file));
    },
    [disabled, insertImageAtCaret, syncInlineImagesWithDom],
  );

  const handleDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragOver(false);

      if (disabled) return;

      const images = Array.from(event.dataTransfer.files).filter(
        (file) => file.type.startsWith("image/"),
      );

      if (images.length === 0) return;

      const caretRange =
        document.caretRangeFromPoint?.(
          event.clientX,
          event.clientY,
        ) ?? null;

      if (
        caretRange &&
        editorRef.current?.contains(
          caretRange.commonAncestorContainer,
        )
      ) {
        lastSelectionRef.current = caretRange.cloneRange();
      }

      syncInlineImagesWithDom();

      images.forEach((file) => insertImageAtCaret(file));
    },
    [disabled, insertImageAtCaret, syncInlineImagesWithDom],
  );

  const addAttachments = useCallback((files: File[]) => {
    const nonImages = files.filter((file) => !file.type.startsWith("image/"));
    if (nonImages.length === 0) return;

    setAttachments((current) => {
      const available = MAX_ATTACHMENTS - current.length;

      if (available <= 0) return current;

      const existingSignatures = new Set(
        current.map(
          ({ file }) =>
            `${file.name}:${file.size}:${file.lastModified}`,
        ),
      );

      const added: AttachmentItem[] = [];

      for (const file of nonImages) {
        if (added.length >= available) break;

        const signature = `${file.name}:${file.size}:${file.lastModified}`;

        if (existingSignatures.has(signature)) continue;

        existingSignatures.add(signature);
        added.push({
          id: newId(),
          file,
        });
      }

      return [...current, ...added];
    });
  }, []);

  function removeAttachment(id: string) {
    setAttachments((current) =>
      current.filter((attachment) => attachment.id !== id),
    );
  }

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const observer = new MutationObserver(() => {
      syncInlineImagesWithDom();
    });

    observer.observe(editor, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [syncInlineImagesWithDom]);

  useEffect(() => {
    const editorElement = editorRef.current;
    if (!editorElement) return;

    const editor = editorElement;

    function handleClick(event: MouseEvent) {
      const target = event.target as HTMLElement;
      const removeButton = target.closest<HTMLElement>(
        "[data-remove-image]",
      );

      if (!removeButton) return;

      event.preventDefault();
      event.stopPropagation();

      const fileKey = removeButton.dataset.removeImage;

      if (fileKey) {
        removeImageByKey(fileKey);
      }
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement;
      const resizeHandle = target.closest<HTMLElement>(
        "[data-resize-image]",
      );

      if (!resizeHandle) return;

      const fileKey = resizeHandle.dataset.resizeImage;
      if (!fileKey) return;

      const wrapper = editor.querySelector<HTMLElement>(
        `[data-appointment-image][data-file-key="${fileKey}"]`,
      );

      if (!wrapper) return;

      event.preventDefault();
      event.stopPropagation();

      const startX = event.clientX;
      const startWidth = wrapper.getBoundingClientRect().width;
      const editorWidth = editor.getBoundingClientRect().width;
      const minWidth = 96;
      const maxWidth = Math.min(
        MAX_IMAGE_WIDTH,
        Math.max(minWidth, editorWidth - 32),
      );

      document.body.style.userSelect = "none";
      document.body.style.cursor = "nwse-resize";

      const handleMove = (moveEvent: PointerEvent) => {
        const nextWidth = Math.min(
          maxWidth,
          Math.max(
            minWidth,
            startWidth + moveEvent.clientX - startX,
          ),
        );

        wrapper.style.width = `${Math.round(nextWidth)}px`;
      };

      const handleUp = () => {
        document.body.style.userSelect = "";
        document.body.style.cursor = "";

        window.removeEventListener(
          "pointermove",
          handleMove,
        );
        window.removeEventListener("pointerup", handleUp);
        window.removeEventListener(
          "pointercancel",
          handleUp,
        );
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
      window.addEventListener("pointercancel", handleUp);
    }

    editor.addEventListener("click", handleClick);
    editor.addEventListener(
      "pointerdown",
      handlePointerDown,
    );

    return () => {
      editor.removeEventListener("click", handleClick);
      editor.removeEventListener(
        "pointerdown",
        handlePointerDown,
      );
    };
  }, [removeImageByKey]);

  useEffect(() => {
    const previews = previewUrlsRef.current;

    return () => {
      for (const url of previews.values()) {
        URL.revokeObjectURL(url);
      }

      previews.clear();
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      exportContent: () => {
        const editor = editorRef.current;
        const storedBlocks: StoredBlock[] = [];
        const files: File[] = [];

        if (!editor) {
          return {
            description: "",
            files: attachments.map(({ file }) => file),
            isValid:
              attachments.length > 0 || existingFileAttachments.length > 0,
            removeAttachmentFileIds: removedExistingIds,
          };
        }

        syncInlineImagesWithDom();

        let textBuffer = "";

        const flushText = () => {
          const normalized = textBuffer
            .replace(/\u00a0/g, " ")
            .replace(/[ \t]+\n/g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim();

          if (normalized) {
            storedBlocks.push({
              type: "text",
              content: normalized,
            });
          }

          textBuffer = "";
        };

        const walk = (node: Node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            textBuffer += node.textContent ?? "";
            return;
          }

          if (!(node instanceof HTMLElement)) return;

          if (node.dataset.appointmentImage === "true") {
            flushText();

            const fileKey = node.dataset.fileKey;
            if (!fileKey) return;

            const file = inlineFilesRef.current.get(fileKey);
            if (!file) return;

            storedBlocks.push({
              type: "image",
              fileIndex: files.length,
            });
            files.push(file);
            return;
          }

          if (node.tagName === "BR") {
            textBuffer += "\n";
            return;
          }

          const block = isBlockElement(node) || node.tagName === "TR";

          if (
            block &&
            textBuffer &&
            !textBuffer.endsWith("\n")
          ) {
            textBuffer += "\n";
          }

          for (const child of Array.from(node.childNodes)) {
            walk(child);
          }

          if (block && !textBuffer.endsWith("\n")) {
            textBuffer += "\n";
          }
        };

        for (const child of Array.from(editor.childNodes)) {
          walk(child);
        }

        flushText();

        files.push(...attachments.map(({ file }) => file));

        const isValid =
          storedBlocks.length > 0 ||
          attachments.length > 0 ||
          existingFileAttachments.length > 0;

        return {
          description:
            storedBlocks.length > 0
              ? serializeAppointmentDoc(storedBlocks)
              : "",
          files,
          isValid,
          removeAttachmentFileIds: removedExistingIds,
        };
      },
    }),
    [
      attachments,
      existingFileAttachments.length,
      removedExistingIds,
      syncInlineImagesWithDom,
    ],
  );

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <FieldLabel required={required} className={labelClassName}>
            Descrição
          </FieldLabel>

          {hintText ? (
            <span className="text-xs text-muted-foreground">{hintText}</span>
          ) : null}
        </div>

        <div
          className={cn(
            "rounded-xl border bg-muted/20 transition-colors",
            dragOver
              ? "border-primary ring-2 ring-primary/20"
              : "border-border",
          )}
        >
          <div
            ref={setEditorNode}
            contentEditable={!disabled}
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-label="Descrição"
            data-placeholder={placeholder}
            onInput={() => {
              saveSelection();
              syncInlineImagesWithDom();
            }}
            onKeyUp={saveSelection}
            onMouseUp={saveSelection}
            onFocus={saveSelection}
            onPaste={handlePaste}
            onDragEnter={(event) => {
              event.preventDefault();

              if (!disabled) {
                setDragOver(true);
              }
            }}
            onDragLeave={(event) => {
              event.preventDefault();

              if (
                !event.currentTarget.contains(
                  event.relatedTarget as Node,
                )
              ) {
                setDragOver(false);
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();
            }}
            onDrop={handleDrop}
            className={cn(
              "min-h-[180px] max-h-[420px] w-full cursor-text overflow-x-hidden overflow-y-auto break-words px-4 py-3 text-sm leading-6 outline-none",
              "whitespace-pre-wrap text-foreground",
              "[&_b]:font-semibold [&_strong]:font-semibold",
              "[&_p]:my-1 [&_div]:my-0.5 [&_br]:leading-6",
              "[&_table]:w-full [&_table]:border-collapse [&_td]:align-top [&_td]:py-0.5",
              "empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]",
              "[&_[data-appointment-image]]:cursor-default [&_[data-appointment-image]]:max-w-full",
              disabled && "cursor-not-allowed opacity-60",
            )}
          />

        </div>
      </div>

      <div
        className="space-y-2 rounded-xl border bg-muted/10 p-3"
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (disabled) return;
          addAttachments(Array.from(event.dataTransfer.files));
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium">Anexos</div>
            <p className="text-xs text-muted-foreground">
              Arquivos como ZIP, RAR, PDF, DOC (imagens vão na descrição com Ctrl+V)
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={
              disabled || attachments.length >= MAX_ATTACHMENTS
            }
            onClick={() => attachmentInputRef.current?.click()}
          >
            <Paperclip className="mr-1.5 size-4" />
            {appendButtonLabel}
          </Button>

          <input
            ref={attachmentInputRef}
            type="file"
            multiple
            accept=".zip,.rar,.7z,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.json,.xml,.log,.mp4,.mp3,.wav,.msg,.eml,application/*,text/*,audio/*,video/*"
            className="sr-only"
            disabled={disabled}
            onChange={(event) => {
              addAttachments(
                Array.from(event.target.files ?? []),
              );

              event.target.value = "";
            }}
          />
        </div>

        {attachments.length > 0 || existingFileAttachments.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {existingFileAttachments.map((item) => (
              <div
                key={`existing-${item.fileId}`}
                className="flex min-w-0 items-center gap-3 rounded-lg border bg-background px-3 py-2"
              >
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{item.originalName}</div>
                  <div className="text-xs text-muted-foreground">
                    Já anexado
                    {item.size != null ? ` · ${formatFileSize(item.size)}` : ""}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  disabled={disabled}
                  aria-label={`Remover ${item.originalName}`}
                  title="Remover anexo"
                  onClick={() =>
                    setRemovedExistingIds((current) =>
                      current.includes(item.fileId)
                        ? current
                        : [...current, item.fileId],
                    )
                  }
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
            {attachments.map(({ id, file }) => (
              <div
                key={id}
                className="flex min-w-0 items-center gap-3 rounded-lg border bg-background px-3 py-2"
              >
                <FileText className="size-4 shrink-0 text-muted-foreground" />

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">
                    {file.name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatFileSize(file.size)}
                  </div>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  disabled={disabled}
                  aria-label={`Remover ${file.name}`}
                  onClick={() => removeAttachment(id)}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
            Nenhum arquivo anexado.
          </div>
        )}

        <div className="text-right text-[11px] text-muted-foreground">
          {attachments.length + existingFileAttachments.length}/{MAX_ATTACHMENTS}{" "}
          anexos
        </div>
      </div>
    </div>
  );
});
