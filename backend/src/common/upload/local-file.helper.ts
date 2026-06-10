import { mkdir, writeFile } from 'fs/promises';
import { dirname } from 'path';

export async function ensureDirForFile(targetPath: string): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true });
}

export async function writeUploadedBuffer(
  targetPath: string,
  buffer: Buffer,
): Promise<void> {
  await ensureDirForFile(targetPath);
  await writeFile(targetPath, buffer);
}
