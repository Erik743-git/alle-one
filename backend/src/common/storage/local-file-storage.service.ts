import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { Injectable } from '@nestjs/common';
import { writeUploadedBuffer } from '../upload/local-file.helper';
import {
  FileStorageService,
  type StoredFileRef,
} from './file-storage.service';

@Injectable()
export class LocalFileStorageService extends FileStorageService {
  private readonly root = join(process.cwd(), 'uploads');

  async saveBuffer(relativeKey: string, buffer: Buffer): Promise<StoredFileRef> {
    const storagePath = join(this.root, relativeKey);
    await writeUploadedBuffer(storagePath, buffer);
    return { storagePath };
  }

  async readBuffer(storagePath: string): Promise<Buffer> {
    return readFile(storagePath);
  }

  async exists(storagePath: string): Promise<boolean> {
    return existsSync(storagePath);
  }
}
