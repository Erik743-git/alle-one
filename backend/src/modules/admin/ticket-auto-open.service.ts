import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { FileStorageService } from '../../common/storage/file-storage.service';
import {
  assertAllowedUpload,
  TICKET_APPOINTMENT_UPLOAD_MAX_BYTES,
} from '../../common/upload.config';
import { PermissionsService } from '../permissions/permissions.service';
import { TicketsService } from '../tickets/tickets.service';
import { TicketsCatalogsService } from '../tickets/tickets-catalogs.service';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import type { CreateTicketDto } from '../tickets/tickets-create.dto';
import {
  CreateTicketAutoOpenRuleDto,
  UpdateTicketAutoOpenRuleDto,
} from './ticket-auto-open.dto';
import { TicketAutoOpenPeriodicity } from '@prisma/client';
import {
  advanceScheduledDate,
  formatYmdUtc,
  normalizeAutoOpenResponsibleStorage,
  normalizeAutoOpenResponsibleFromDb,
  parseRuleDueAt,
  parseYmdToUtcDate,
  normalizeScheduleTime,
  resolveAutoOpenResponsibleId,
  TICKET_AUTO_OPEN_PERIODICITY_LABELS,
  type TicketAutoOpenPeriodicityValue,
} from './ticket-auto-open.helper';
import { appointmentDescriptionToPlainText } from '../tickets/appointment-doc.util';

const AUTO_OPEN_MAX_ATTACHMENTS = 10;
const AUTO_OPEN_PREVIEW_MAX_BYTES = 1024 * 1024;

export type TicketAutoOpenRuleAttachmentDto = {
  fileId: string;
  originalName: string;
  mimeType: string;
  size: number;
  previewDataUrl: string | null;
};

export type TicketAutoOpenRuleDto = {
  id: string;
  name: string;
  active: boolean;
  periodicity: TicketAutoOpenPeriodicityValue;
  periodicityLabel: string;
  nextScheduledDate: string;
  scheduleTime: string;
  deskExternalId: number;
  clientExternalId: number;
  responsibleExternalId: number;
  priorityExternalId: number | null;
  servicesCatalogsItemId: number | null;
  classificationId: string | null;
  title: string;
  description: string;
  requestorName: string;
  requestorEmail: string;
  requestorTelephone: string | null;
  requestorExternalId: number | null;
  externalGmudRef: string | null;
  ccEmails: string[];
  parentTicketNumber: number | null;
  lastRunAt: string | null;
  lastTicketNumber: number | null;
  createdAt: string;
  attachments: TicketAutoOpenRuleAttachmentDto[];
};

@Injectable()
export class TicketAutoOpenService {
  private readonly logger = new Logger(TicketAutoOpenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ticketsService: TicketsService,
    private readonly permissionsService: PermissionsService,
    private readonly catalogs: TicketsCatalogsService,
    private readonly fileStorage: FileStorageService,
  ) {}

  private map(
    row: {
      id: string;
      name: string;
      active: boolean;
      periodicity: TicketAutoOpenPeriodicityValue;
      nextScheduledDate: Date;
      scheduleTime: string;
      deskExternalId: number;
      clientExternalId: number;
      responsibleExternalId: number | null;
      priorityExternalId: number | null;
      servicesCatalogsItemId: number | null;
      classificationId: string | null;
      title: string;
      description: string;
      requestorName: string;
      requestorEmail: string;
      requestorTelephone: string | null;
      requestorExternalId: number | null;
      externalGmudRef: string | null;
      ccEmails: string[];
      parentTicketNumber: number | null;
      lastRunAt: Date | null;
      lastTicketNumber: number | null;
      createdAt: Date;
    },
    attachments: TicketAutoOpenRuleAttachmentDto[] = [],
  ): TicketAutoOpenRuleDto {
    return {
      id: row.id,
      name: row.name,
      active: row.active,
      periodicity: row.periodicity,
      periodicityLabel: TICKET_AUTO_OPEN_PERIODICITY_LABELS[row.periodicity],
      nextScheduledDate: formatYmdUtc(row.nextScheduledDate),
      scheduleTime: row.scheduleTime,
      deskExternalId: row.deskExternalId,
      clientExternalId: row.clientExternalId,
      responsibleExternalId: normalizeAutoOpenResponsibleFromDb(
        row.responsibleExternalId,
      ),
      priorityExternalId: row.priorityExternalId,
      servicesCatalogsItemId: row.servicesCatalogsItemId,
      classificationId: row.classificationId,
      title: row.title,
      description: row.description,
      requestorName: row.requestorName,
      requestorEmail: row.requestorEmail,
      requestorTelephone: row.requestorTelephone,
      requestorExternalId: row.requestorExternalId,
      externalGmudRef: row.externalGmudRef,
      ccEmails: row.ccEmails ?? [],
      parentTicketNumber: row.parentTicketNumber,
      lastRunAt: row.lastRunAt?.toISOString() ?? null,
      lastTicketNumber: row.lastTicketNumber,
      createdAt: row.createdAt.toISOString(),
      attachments,
    };
  }

  private ruleInclude = {
    attachments: {
      include: { file: true },
      orderBy: { createdAt: 'asc' as const },
    },
  } as const;

  private async buildImagePreviewDataUrl(file: {
    path: string;
    mimeType: string;
    size: number;
  }): Promise<string | null> {
    if (!file.mimeType.startsWith('image/')) return null;
    if (file.size > AUTO_OPEN_PREVIEW_MAX_BYTES) return null;
    try {
      const buffer = await this.fileStorage.readBuffer(file.path);
      if (buffer.length > AUTO_OPEN_PREVIEW_MAX_BYTES) return null;
      return `data:${file.mimeType};base64,${buffer.toString('base64')}`;
    } catch {
      return null;
    }
  }

  private async mapAttachments(
    rows: Array<{
      file: {
        id: string;
        originalName: string;
        mimeType: string;
        size: number;
        path: string;
        deletedAt: Date | null;
      };
    }>,
  ): Promise<TicketAutoOpenRuleAttachmentDto[]> {
    const result: TicketAutoOpenRuleAttachmentDto[] = [];
    for (const row of rows) {
      if (row.file.deletedAt) continue;
      result.push({
        fileId: row.file.id,
        originalName: row.file.originalName,
        mimeType: row.file.mimeType,
        size: row.file.size,
        previewDataUrl: await this.buildImagePreviewDataUrl(row.file),
      });
    }
    return result;
  }

  private async findRuleDto(id: string): Promise<TicketAutoOpenRuleDto> {
    const row = await this.prisma.ticketAutoOpenRule.findFirst({
      where: { id, deletedAt: null },
      include: this.ruleInclude,
    });
    if (!row) throw new NotFoundException('Regra não encontrada.');
    const attachments = await this.mapAttachments(row.attachments);
    return this.map(row, attachments);
  }

  private assertDescriptionOrAttachments(
    description: string,
    fileCount: number,
  ) {
    const plain = appointmentDescriptionToPlainText(description.trim());
    if (!plain && fileCount === 0) {
      throw new BadRequestException(
        'Informe a descrição do ticket ou anexe arquivos.',
      );
    }
  }

  private async syncRuleAttachments(
    actor: AuthenticatedRequestUser,
    ruleId: string,
    newFiles: Express.Multer.File[],
    removeFileIds: string[] = [],
  ) {
    const uniqueRemoveIds = [
      ...new Set(removeFileIds.map((id) => id.trim()).filter(Boolean)),
    ];
    if (uniqueRemoveIds.length > 0) {
      await this.prisma.ticketAutoOpenRuleAttachment.deleteMany({
        where: {
          ruleId,
          fileId: { in: uniqueRemoveIds },
        },
      });
    }

    if (!newFiles.length) return;

    const currentCount = await this.prisma.ticketAutoOpenRuleAttachment.count({
      where: { ruleId },
    });
    const available = AUTO_OPEN_MAX_ATTACHMENTS - currentCount;
    if (available <= 0) {
      throw new BadRequestException(
        `Limite de ${AUTO_OPEN_MAX_ATTACHMENTS} anexos por rotina.`,
      );
    }

    const seen = new Set<string>();
    const uniqueFiles = newFiles.filter((file) => {
      const key = `${file.originalname}:${file.size}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    for (const file of uniqueFiles.slice(0, available)) {
      assertAllowedUpload(file);
      if (file.size > TICKET_APPOINTMENT_UPLOAD_MAX_BYTES) {
        throw new BadRequestException(
          `Arquivo "${file.originalname}" excede o limite de 25MB.`,
        );
      }

      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const targetName = `${Date.now()}-${randomUUID()}-${safeName}`;
      const relativeKey = join('auto-open-rules', ruleId, targetName);
      const stored = await this.fileStorage.saveBuffer(
        relativeKey,
        file.buffer,
      );

      const createdFile = await this.prisma.file.create({
        data: {
          originalName: file.originalname,
          mimeType: file.mimetype || 'application/octet-stream',
          path: stored.storagePath,
          size: file.size,
          uploadedBy: actor.userId,
        },
      });

      await this.prisma.ticketAutoOpenRuleAttachment.create({
        data: {
          ruleId,
          fileId: createdFile.id,
        },
      });
    }
  }

  private async loadRuleAttachmentFiles(
    ruleId: string,
  ): Promise<Express.Multer.File[]> {
    const rows = await this.prisma.ticketAutoOpenRuleAttachment.findMany({
      where: { ruleId },
      include: { file: true },
      orderBy: { createdAt: 'asc' },
    });

    const files: Express.Multer.File[] = [];
    for (const row of rows) {
      if (row.file.deletedAt) continue;
      const buffer = await this.fileStorage.readBuffer(row.file.path);
      files.push({
        fieldname: 'files',
        originalname: row.file.originalName,
        encoding: '7bit',
        mimetype: row.file.mimeType,
        size: row.file.size,
        buffer,
      } as Express.Multer.File);
    }
    return files;
  }

  private async enrichCatalogFromClassification<
    T extends {
      classificationId: string | null;
      servicesCatalogsItemId: number | null;
    },
  >(data: T): Promise<T> {
    if (data.servicesCatalogsItemId || !data.classificationId) {
      return data;
    }
    const itemId =
      await this.catalogs.resolveTifluxServiceItemIdFromClassification(
        data.classificationId,
      );
    if (!itemId) return data;
    return { ...data, servicesCatalogsItemId: itemId };
  }

  private normalizeDto(dto: CreateTicketAutoOpenRuleDto) {
    const ccEmails = (dto.ccEmails ?? [])
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
    return {
      name: dto.name.trim(),
      active: dto.active ?? true,
      periodicity: dto.periodicity,
      nextScheduledDate: parseYmdToUtcDate(dto.nextScheduledDate),
      scheduleTime: normalizeScheduleTime(dto.scheduleTime),
      deskExternalId: dto.deskId,
      clientExternalId: dto.clientId,
      responsibleExternalId: normalizeAutoOpenResponsibleStorage(
        dto.responsibleId,
      ),
      priorityExternalId: dto.priorityId ?? null,
      servicesCatalogsItemId: dto.servicesCatalogsItemId ?? null,
      classificationId: dto.classificationId?.trim() || null,
      title: dto.title.trim(),
      description: dto.description.trim(),
      requestorName: dto.requestorName.trim(),
      requestorEmail: dto.requestorEmail.trim(),
      requestorTelephone: dto.requestorTelephone?.trim() || null,
      requestorExternalId: dto.requestorId ?? null,
      externalGmudRef: dto.externalGmudRef?.trim() || null,
      ccEmails,
      parentTicketNumber: dto.parentTicketNumber ?? null,
    };
  }

  private async assertRuleClassification(data: {
    deskExternalId: number;
    classificationId: string | null;
  }) {
    await this.catalogs.assertValidClassificationForDesk(
      data.deskExternalId,
      data.classificationId,
    );
  }

  private rethrowPrismaSetupError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2021' || error.code === 'P2022')
    ) {
      throw new InternalServerErrorException(
        'Abertura automática ainda não está disponível neste ambiente. Avise o suporte para aplicar as migrations do banco.',
      );
    }
    throw error;
  }

  async list(): Promise<TicketAutoOpenRuleDto[]> {
    try {
      const rows = await this.prisma.ticketAutoOpenRule.findMany({
        where: { deletedAt: null },
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
        include: this.ruleInclude,
      });
      return Promise.all(
        rows.map(async (row) =>
          this.map(row, await this.mapAttachments(row.attachments)),
        ),
      );
    } catch (error) {
      this.rethrowPrismaSetupError(error);
    }
  }

  async create(
    actor: AuthenticatedRequestUser,
    dto: CreateTicketAutoOpenRuleDto,
    files: Express.Multer.File[] = [],
  ): Promise<TicketAutoOpenRuleDto> {
    let data = this.normalizeDto(dto);
    data = await this.enrichCatalogFromClassification(data);
    if (!data.name) throw new BadRequestException('Informe o nome da regra.');
    this.assertDescriptionOrAttachments(data.description, files.length);
    await this.assertRuleClassification(data);

    try {
      const created = await this.prisma.ticketAutoOpenRule.create({
        data: {
          ...data,
          createdBy: actor.userId,
        },
      });
      await this.syncRuleAttachments(actor, created.id, files);
      return this.findRuleDto(created.id);
    } catch (error) {
      this.rethrowPrismaSetupError(error);
    }
  }

  async update(
    id: string,
    dto: UpdateTicketAutoOpenRuleDto,
    actor: AuthenticatedRequestUser,
    files: Express.Multer.File[] = [],
  ): Promise<TicketAutoOpenRuleDto> {
    const existing = await this.prisma.ticketAutoOpenRule.findFirst({
      where: { id, deletedAt: null },
      include: { attachments: true },
    });
    if (!existing) throw new NotFoundException('Regra não encontrada.');

    const data = this.normalizeDto(dto);
    const enriched = await this.enrichCatalogFromClassification(data);
    const removeSet = new Set(dto.removeAttachmentFileIds ?? []);
    const remainingAfterRemove = existing.attachments.filter(
      (attachment) => !removeSet.has(attachment.fileId),
    ).length;
    this.assertDescriptionOrAttachments(
      enriched.description,
      remainingAfterRemove + files.length,
    );
    await this.assertRuleClassification(enriched);
    try {
      await this.prisma.ticketAutoOpenRule.update({
        where: { id },
        data: enriched,
      });
      await this.syncRuleAttachments(
        actor,
        id,
        files,
        dto.removeAttachmentFileIds ?? [],
      );
      return this.findRuleDto(id);
    } catch (error) {
      this.rethrowPrismaSetupError(error);
    }
  }

  async setActive(id: string, active: boolean): Promise<TicketAutoOpenRuleDto> {
    const existing = await this.prisma.ticketAutoOpenRule.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Regra não encontrada.');

    const updated = await this.prisma.ticketAutoOpenRule.update({
      where: { id },
      data: { active },
    });
    return this.findRuleDto(updated.id);
  }

  async remove(id: string): Promise<{ ok: true }> {
    const existing = await this.prisma.ticketAutoOpenRule.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Regra não encontrada.');

    await this.prisma.ticketAutoOpenRule.update({
      where: { id },
      data: { deletedAt: new Date(), active: false },
    });
    return { ok: true };
  }

  private buildCreateTicketDto(rule: {
    deskExternalId: number;
    clientExternalId: number;
    responsibleExternalId: number | null;
    priorityExternalId: number | null;
    servicesCatalogsItemId: number | null;
    classificationId: string | null;
    title: string;
    description: string;
    requestorName: string;
    requestorEmail: string;
    requestorTelephone: string | null;
    requestorExternalId: number | null;
    externalGmudRef: string | null;
    ccEmails: string[];
  }): CreateTicketDto {
    return {
      title: rule.title,
      description: rule.description,
      clientId: rule.clientExternalId,
      deskId: rule.deskExternalId,
      priorityId: rule.priorityExternalId ?? undefined,
      servicesCatalogsItemId: rule.servicesCatalogsItemId ?? undefined,
      classificationId: rule.classificationId ?? undefined,
      responsibleId: resolveAutoOpenResponsibleId(rule.responsibleExternalId),
      requestorId: rule.requestorExternalId ?? undefined,
      requestorName: rule.requestorName,
      requestorEmail: rule.requestorEmail,
      requestorTelephone: rule.requestorTelephone ?? undefined,
      externalGmudRef: rule.externalGmudRef ?? undefined,
      ccEmails: rule.ccEmails.length ? rule.ccEmails : undefined,
    };
  }

  async processDueRules(limit = 20): Promise<{
    processed: number;
    errors: number;
    results: Array<{
      ruleId: string;
      ruleName: string;
      ok: boolean;
      ticketNumber?: number;
      isPreTicket?: boolean;
      error?: string;
    }>;
  }> {
    const now = new Date();
    const candidates = await this.prisma.ticketAutoOpenRule.findMany({
      where: { active: true, deletedAt: null },
      orderBy: { nextScheduledDate: 'asc' },
      take: 100,
      include: { _count: { select: { attachments: true } } },
    });

    let processed = 0;
    let errors = 0;
    const results: Array<{
      ruleId: string;
      ruleName: string;
      ok: boolean;
      ticketNumber?: number;
      isPreTicket?: boolean;
      error?: string;
    }> = [];

    for (const rule of candidates) {
      if (processed >= limit) break;
      const dueAt = parseRuleDueAt({
        nextScheduledDate: rule.nextScheduledDate,
        scheduleTime: rule.scheduleTime,
      });
      if (dueAt.getTime() > now.getTime()) continue;

      try {
        const descriptionPlain = appointmentDescriptionToPlainText(
          rule.description.trim(),
        );
        const attachmentCount = rule._count.attachments;
        if (!descriptionPlain && attachmentCount === 0) {
          throw new BadRequestException(
            'Descrição da regra está vazia ou inválida.',
          );
        }

        const user = await this.prisma.user.findUnique({
          where: { id: rule.createdBy },
          select: { id: true },
        });
        if (!user) {
          throw new BadRequestException(
            'Usuário criador da regra não encontrado.',
          );
        }

        const actor = await this.permissionsService.buildRequestUser(
          user.id,
          undefined,
          { skipTokenVersionCheck: true },
        );

        const attachmentFiles = await this.loadRuleAttachmentFiles(rule.id);

        const result = await this.ticketsService.createTicket(
          actor,
          this.buildCreateTicketDto(rule),
          attachmentFiles,
        );

        const updateData: {
          lastRunAt: Date;
          lastTicketNumber: number;
          nextScheduledDate?: Date;
          active?: boolean;
        } = {
          lastRunAt: now,
          lastTicketNumber: result.ticketNumber,
        };

        if (rule.periodicity === TicketAutoOpenPeriodicity.ONCE) {
          updateData.active = false;
        } else {
          updateData.nextScheduledDate = advanceScheduledDate(
            rule.nextScheduledDate,
            rule.periodicity,
          );
        }

        await this.prisma.ticketAutoOpenRule.update({
          where: { id: rule.id },
          data: updateData,
        });

        if (rule.parentTicketNumber && Number.isFinite(result.ticketNumber)) {
          try {
            await this.ticketsService.groupIntoParent(
              actor,
              result.ticketNumber,
              rule.parentTicketNumber,
            );
          } catch (err) {
            this.logger.warn(
              `Ticket ${result.ticketNumber} criado, mas agrupamento falhou: ${
                err instanceof Error ? err.message : err
              }`,
            );
          }
        }

        processed += 1;
        results.push({
          ruleId: rule.id,
          ruleName: rule.name,
          ok: true,
          ticketNumber: result.ticketNumber,
          isPreTicket: result.isPreTicket,
        });
        this.logger.log(
          `Regra "${rule.name}" abriu ticket #${result.ticketNumber}${
            result.isPreTicket ? ' (pré-ticket)' : ''
          }`,
        );
      } catch (err) {
        errors += 1;
        const message = err instanceof Error ? err.message : String(err);
        results.push({
          ruleId: rule.id,
          ruleName: rule.name,
          ok: false,
          error: message,
        });
        this.logger.error(
          `Falha na regra "${rule.name}" (${rule.id}) [próx: ${formatYmdUtc(rule.nextScheduledDate)} ${rule.scheduleTime}]: ${message}`,
          err instanceof Error ? err.stack : undefined,
        );
      }
    }

    return { processed, errors, results };
  }
}
