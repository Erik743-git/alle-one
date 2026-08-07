import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { Injectable, Logger } from '@nestjs/common';
import { FileStorageService, type StoredFileRef } from './file-storage.service';

type S3ClientLike = {
  send(command: unknown): Promise<unknown>;
};

type PutObjectCommandLike = new (input: {
  Bucket: string;
  Key: string;
  Body: Buffer;
  ContentType?: string;
}) => unknown;

type GetObjectCommandLike = new (input: {
  Bucket: string;
  Key: string;
}) => unknown;

@Injectable()
export class S3FileStorageService extends FileStorageService {
  private readonly logger = new Logger(S3FileStorageService.name);
  private client: S3ClientLike | null = null;
  private PutObjectCommand: PutObjectCommandLike | null = null;
  private GetObjectCommand: GetObjectCommandLike | null = null;

  private readonly bucket = process.env.FILE_STORAGE_S3_BUCKET ?? '';
  private readonly prefix = (
    process.env.FILE_STORAGE_S3_PREFIX ?? 'alleone'
  ).replace(/^\/+|\/+$/g, '');
  private readonly cacheRoot = join(process.cwd(), 'uploads', '_s3_cache');

  private async ensureClient(): Promise<void> {
    if (this.client) return;
    if (!this.bucket) {
      throw new Error(
        'FILE_STORAGE_S3_BUCKET é obrigatório com FILE_STORAGE_DRIVER=s3',
      );
    }

    try {
      const sdk = await import('@aws-sdk/client-s3');
      this.client = new sdk.S3Client({
        region: process.env.FILE_STORAGE_S3_REGION ?? 'us-east-1',
        endpoint: process.env.FILE_STORAGE_S3_ENDPOINT || undefined,
        forcePathStyle: process.env.FILE_STORAGE_S3_FORCE_PATH_STYLE === 'true',
        credentials:
          process.env.FILE_STORAGE_S3_ACCESS_KEY_ID &&
          process.env.FILE_STORAGE_S3_SECRET_ACCESS_KEY
            ? {
                accessKeyId: process.env.FILE_STORAGE_S3_ACCESS_KEY_ID,
                secretAccessKey: process.env.FILE_STORAGE_S3_SECRET_ACCESS_KEY,
              }
            : undefined,
      });
      this.PutObjectCommand = sdk.PutObjectCommand;
      this.GetObjectCommand = sdk.GetObjectCommand;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Pacote @aws-sdk/client-s3 necessário para FILE_STORAGE_DRIVER=s3: ${msg}`,
      );
    }
  }

  private objectKey(relativeKey: string): string {
    return this.prefix ? `${this.prefix}/${relativeKey}` : relativeKey;
  }

  private storageRef(key: string): string {
    return `s3://${this.bucket}/${key}`;
  }

  async saveBuffer(
    relativeKey: string,
    buffer: Buffer,
  ): Promise<StoredFileRef> {
    await this.ensureClient();
    const key = this.objectKey(relativeKey);
    await this.client!.send(
      new this.PutObjectCommand!({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
      }),
    );
    return { storagePath: this.storageRef(key) };
  }

  async readBuffer(storagePath: string): Promise<Buffer> {
    const key = this.parseKey(storagePath);
    const cachePath = join(this.cacheRoot, key);
    if (!existsSync(cachePath)) {
      await this.downloadToCache(storagePath, cachePath);
    }
    return readFile(cachePath);
  }

  async exists(storagePath: string): Promise<boolean> {
    const key = this.parseKey(storagePath);
    return existsSync(join(this.cacheRoot, key));
  }

  private parseKey(storagePath: string): string {
    const prefix = `s3://${this.bucket}/`;
    if (!storagePath.startsWith(prefix)) {
      throw new Error(`Referência S3 inválida: ${storagePath}`);
    }
    return storagePath.slice(prefix.length);
  }

  private async downloadToCache(storagePath: string, cachePath: string) {
    await this.ensureClient();
    const key = this.parseKey(storagePath);
    const response = (await this.client!.send(
      new this.GetObjectCommand!({
        Bucket: this.bucket,
        Key: key,
      }),
    )) as { Body?: { transformToByteArray?: () => Promise<Uint8Array> } };

    const bytes = await response.Body?.transformToByteArray?.();
    if (!bytes) {
      throw new Error('Resposta S3 sem corpo');
    }
    mkdirSync(dirname(cachePath), { recursive: true });
    writeFileSync(cachePath, Buffer.from(bytes));
  }
}
