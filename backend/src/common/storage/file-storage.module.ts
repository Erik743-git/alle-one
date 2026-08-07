import { Global, Module } from '@nestjs/common';
import { FileStorageService } from './file-storage.service';
import { LocalFileStorageService } from './local-file-storage.service';
import { S3FileStorageService } from './s3-file-storage.service';

@Global()
@Module({
  providers: [
    LocalFileStorageService,
    S3FileStorageService,
    {
      provide: FileStorageService,
      useFactory: (
        local: LocalFileStorageService,
        s3: S3FileStorageService,
      ) => {
        const driver = (
          process.env.FILE_STORAGE_DRIVER ?? 'local'
        ).toLowerCase();
        return driver === 's3' ? s3 : local;
      },
      inject: [LocalFileStorageService, S3FileStorageService],
    },
  ],
  exports: [FileStorageService],
})
export class FileStorageModule {}
