/** Extrai nome de arquivo do header Content-Disposition. */
export function parseContentDispositionFilename(
  disposition: string,
  fallback: string,
): string {
  const match = /filename\*=UTF-8''([^;]+)|filename="([^"]+)"|filename=([^;]+)/i.exec(
    disposition,
  );
  const raw = match?.[1] ?? match?.[2] ?? match?.[3] ?? fallback;
  try {
    return decodeURIComponent(raw.trim());
  } catch {
    return raw.trim();
  }
}

export type BlobDownloadResult = {
  blob: Blob;
  filename: string;
  mimeType: string;
};

/** Lê blob + metadados de uma Response HTTP (download de anexo/arquivo). */
export async function readBlobDownload(
  response: Response,
  fallbackFilename = "arquivo",
): Promise<BlobDownloadResult> {
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filename = parseContentDispositionFilename(disposition, fallbackFilename);
  const mimeType =
    response.headers.get("Content-Type") ??
    blob.type ??
    "application/octet-stream";
  return { blob, filename, mimeType };
}

/** Dispara download no navegador. */
export function triggerBrowserDownload(
  blob: Blob,
  filename: string,
): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
