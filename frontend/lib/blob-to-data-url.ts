export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Falha ao ler o arquivo."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler o arquivo."));
    reader.readAsDataURL(blob);
  });
}

export function fileToDataUrl(file: File | Blob): Promise<string> {
  return blobToDataUrl(file);
}
