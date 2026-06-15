export type StoredFileRef = {
  /** Valor persistido em `files.path` (caminho local ou chave S3). */
  storagePath: string;
};

export abstract class FileStorageService {
  abstract saveBuffer(
    relativeKey: string,
    buffer: Buffer,
  ): Promise<StoredFileRef>;

  abstract readBuffer(storagePath: string): Promise<Buffer>;

  abstract exists(storagePath: string): Promise<boolean>;
}
