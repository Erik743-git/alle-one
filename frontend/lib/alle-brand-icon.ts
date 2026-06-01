import { readFile } from "node:fs/promises";
import path from "node:path";

let cachedDataUrl: string | null = null;

/** Símbolo Alle (Brand Guide) em base64 para geração de favicon via next/og. */
export async function getAlleSimboloDataUrl(): Promise<string> {
  if (cachedDataUrl) return cachedDataUrl;

  const filePath = path.join(process.cwd(), "public", "alle-simbolo.png");
  const buffer = await readFile(filePath);
  cachedDataUrl = `data:image/png;base64,${buffer.toString("base64")}`;
  return cachedDataUrl;
}
