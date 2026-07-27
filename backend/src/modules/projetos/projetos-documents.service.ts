import {
  BadRequestException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { FileStorageService } from '../../common/storage/file-storage.service';
import {
  assertAllowedUpload,
  UPLOAD_MAX_BYTES,
} from '../../common/upload.config';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import type { ProjectDocumentDto } from './projetos.service';

const PROJECT_DOC_MIMES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

@Injectable()
export class ProjetosDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fileStorage: FileStorageService,
  ) {}

  async list(projectId: string): Promise<ProjectDocumentDto[]> {
    const rows = await this.prisma.projectDocument.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      include: {
        file: {
          select: {
            id: true,
            originalName: true,
            mimeType: true,
            size: true,
          },
        },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      fileId: row.file.id,
      originalName: row.file.originalName,
      mimeType: row.file.mimeType,
      size: row.file.size,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async save(
    user: AuthenticatedRequestUser,
    projectId: string,
    files: Express.Multer.File[],
  ): Promise<void> {
    for (const file of files) {
      this.assertMime(file);
      if (file.size > UPLOAD_MAX_BYTES) {
        throw new BadRequestException(
          `Arquivo "${file.originalname}" excede o limite de 10MB.`,
        );
      }
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const targetName = `${Date.now()}-${randomUUID()}-${safeName}`;
      const relativeKey = join('projetos', projectId, targetName);
      const stored = await this.fileStorage.saveBuffer(relativeKey, file.buffer);
      const createdFile = await this.prisma.file.create({
        data: {
          originalName: file.originalname,
          mimeType: file.mimetype || 'application/octet-stream',
          path: stored.storagePath,
          size: file.size,
          uploadedBy: user.userId,
        },
      });
      await this.prisma.projectDocument.create({
        data: { projectId, fileId: createdFile.id },
      });
    }
  }

  async download(projectId: string, documentId: string) {
    const doc = await this.prisma.projectDocument.findFirst({
      where: { id: documentId, projectId },
      include: { file: true },
    });
    if (!doc?.file || doc.file.deletedAt) {
      throw new NotFoundException('Documento não encontrado.');
    }
    const buffer = await this.fileStorage.readBuffer(doc.file.path);
    return {
      stream: new StreamableFile(buffer),
      originalName: doc.file.originalName,
      mimeType: doc.file.mimeType,
    };
  }

  private assertMime(file: {
    mimetype?: string | null;
    buffer?: Buffer | null;
  }) {
    assertAllowedUpload(file);
    const mime = (file.mimetype || '').toLowerCase();
    const ok = PROJECT_DOC_MIMES.some(
      (allowed) => mime === allowed || mime.startsWith(allowed),
    );
    if (!ok) {
      throw new BadRequestException(
        'Documentação do projeto: use PDF ou Word (.pdf, .doc, .docx).',
      );
    }
  }
}
