import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GmudStatus, GmudApproverStatus } from '@prisma/client';
import { isClientPortalRole } from '../../common/security/client-portal-role';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ApproveGmudDto,
  ApproveOnBehalfGmudDto,
  CreateGmudDto,
  ListGmudsQueryDto,
  SearchUsersQueryDto,
  UpdateGmudDto,
} from './dto/gmud.dto';
import { AuthenticatedRequestUser } from './gmud.types';
import {
  gmudParticipationWhere,
  seesGmudsByParticipationOnly,
  userParticipatesInGmud,
} from './gmud-access';
import {
  assertAllowedUpload,
  UPLOAD_MAX_BYTES,
} from '../../common/upload.config';
import { GmudMailService } from './mail/gmud-mail.service';
import { GmudPdfService } from './gmud-pdf.service';
import { randomUUID } from 'crypto';
import { writeUploadedBuffer } from '../../common/upload/local-file.helper';
import { join } from 'path';

function parseOptionalDate(value?: string | null) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException('Data inválida');
  }
  return parsed;
}

@Injectable()
export class GmudService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: GmudMailService,
    private readonly pdf: GmudPdfService,
  ) {}

  private async getAccessibleCompanyIds(
    user: AuthenticatedRequestUser,
  ): Promise<string[]> {
    if (isClientPortalRole(user.role)) {
      if (!user.companyId) {
        throw new ForbiddenException('Usuário sem empresa vinculada');
      }
      return [user.companyId];
    }

    // Equipe interna (ADMIN, COLLABORATOR, PJ): todas as empresas — igual ao Inventário.
    const companies = await this.prisma.company.findMany({
      where: { deletedAt: null },
      select: { id: true },
      orderBy: { name: 'asc' },
    });

    return companies.map((c) => c.id);
  }

  private ensureCompanyInScope(companyId: string, scopeCompanyIds: string[]) {
    if (!scopeCompanyIds.includes(companyId)) {
      throw new ForbiddenException('Sem acesso à empresa informada');
    }
  }

  async listCompanies(user: AuthenticatedRequestUser) {
    const ids = await this.getAccessibleCompanyIds(user);
    return this.prisma.company.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  private canEditGmudStatus(status: GmudStatus) {
    return (
      status === GmudStatus.DRAFT || status === GmudStatus.PENDING_APPROVAL
    );
  }

  async list(user: AuthenticatedRequestUser, query: ListGmudsQueryDto) {
    const statusFilter = query.status
      ? { status: query.status as unknown as GmudStatus }
      : {};

    if (seesGmudsByParticipationOnly(user.role)) {
      return this.prisma.gmud.findMany({
        where: {
          deletedAt: null,
          ...gmudParticipationWhere(user.userId),
          ...(query.companyId ? { companyId: query.companyId } : {}),
          ...statusFilter,
        },
        include: {
          company: { select: { id: true, name: true } },
          creator: { select: { id: true, name: true, email: true } },
          responsible: { select: { id: true, name: true, email: true } },
          executors: {
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
          },
          approvers: {
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    const scopeCompanyIds = await this.getAccessibleCompanyIds(user);

    if (query.companyId) {
      this.ensureCompanyInScope(query.companyId, scopeCompanyIds);
    }

    return this.prisma.gmud.findMany({
      where: {
        deletedAt: null,
        companyId: query.companyId ? query.companyId : { in: scopeCompanyIds },
        ...statusFilter,
      },
      include: {
        company: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true, email: true } },
        responsible: { select: { id: true, name: true, email: true } },
        executors: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
        approvers: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(user: AuthenticatedRequestUser, id: string) {
    const gmud = await this.prisma.gmud.findFirst({
      where: { id, deletedAt: null },
      include: {
        company: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true, email: true } },
        responsible: { select: { id: true, name: true, email: true } },
        executors: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
        approvers: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
        activities: {
          where: { deletedAt: null },
          orderBy: { scheduledAt: 'asc' },
        },
        attachments: {
          include: {
            file: true,
            uploader: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!gmud) {
      throw new NotFoundException('GMUD não encontrada');
    }

    if (seesGmudsByParticipationOnly(user.role)) {
      if (!userParticipatesInGmud(user.userId, gmud)) {
        throw new ForbiddenException('Sem acesso a esta GMUD');
      }
      return gmud;
    }

    const scopeCompanyIds = await this.getAccessibleCompanyIds(user);
    this.ensureCompanyInScope(gmud.companyId, scopeCompanyIds);

    return gmud;
  }

  async exportPdf(user: AuthenticatedRequestUser, id: string) {
    const gmud = await this.prisma.gmud.findFirst({
      where: { id, deletedAt: null },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            logoFile: { select: { path: true, mimeType: true } },
          },
        },
        creator: { select: { id: true, name: true, email: true } },
        responsible: { select: { id: true, name: true, email: true } },
        executors: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
        approvers: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
        activities: {
          where: { deletedAt: null },
          orderBy: { scheduledAt: 'asc' },
        },
        attachments: {
          include: {
            file: { select: { originalName: true, size: true } },
            uploader: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!gmud) {
      throw new NotFoundException('GMUD não encontrada');
    }

    if (seesGmudsByParticipationOnly(user.role)) {
      if (!userParticipatesInGmud(user.userId, gmud)) {
        throw new ForbiddenException('Sem acesso a esta GMUD');
      }
    } else {
      const scopeCompanyIds = await this.getAccessibleCompanyIds(user);
      this.ensureCompanyInScope(gmud.companyId, scopeCompanyIds);
    }

    return this.pdf.build(gmud);
  }

  private async validateCompanyAndUsersScope(
    user: AuthenticatedRequestUser,
    companyId: string,
    executorUserIds: string[],
    approverUserIds: string[],
    responsibleId?: string | null,
  ) {
    const scopeCompanyIds = await this.getAccessibleCompanyIds(user);
    this.ensureCompanyInScope(companyId, scopeCompanyIds);

    const uniqueUserIds = Array.from(
      new Set([
        ...executorUserIds,
        ...approverUserIds,
        ...(responsibleId ? [responsibleId] : []),
      ]),
    );

    const users = await this.prisma.user.findMany({
      where: {
        id: { in: uniqueUserIds },
        deletedAt: null,
        status: 'ACTIVE',
      },
      select: { id: true, role: true, companyId: true },
    });

    if (users.length !== uniqueUserIds.length) {
      throw new BadRequestException(
        'Executores/aprovadores/responsável devem ser usuários válidos e ativos',
      );
    }

    // Regra:
    // - CLIENT só pode ser vinculado à própria empresa da GMUD.
    // - ADMIN/COLLABORATOR podem ser vinculados como executores/aprovadores mesmo sendo de outra empresa (ex.: equipe Alle).
    const invalidUser = users.find((u) => {
      const isClientRole = isClientPortalRole(u.role);
      if (!isClientRole) {
        return false;
      }
      return u.companyId !== companyId;
    });

    if (invalidUser) {
      throw new BadRequestException(
        'Usuários CLIENT só podem ser vinculados à GMUD da própria empresa',
      );
    }
  }

  async create(user: AuthenticatedRequestUser, dto: CreateGmudDto) {
    const downtimeStart = parseOptionalDate(dto.downtimeStart);
    const downtimeEnd = parseOptionalDate(dto.downtimeEnd);

    if (dto.downtime) {
      if (!downtimeStart || !downtimeEnd) {
        throw new BadRequestException(
          'Início e fim do downtime são obrigatórios',
        );
      }
      if (downtimeEnd <= downtimeStart) {
        throw new BadRequestException(
          'Fim do downtime deve ser maior que o início',
        );
      }
    }

    const executorIds = dto.executors.map((e) => e.userId);
    const approverIds = dto.approvers.map((a) => a.userId);

    if (dto.activities?.length) {
      const invalid = dto.activities.find(
        (a) => !executorIds.includes(a.executorUserId),
      );
      if (invalid) {
        throw new BadRequestException(
          'Executor da atividade deve ser um dos executores cadastrados na GMUD',
        );
      }
    }

    await this.validateCompanyAndUsersScope(
      user,
      dto.companyId,
      executorIds,
      approverIds,
      dto.responsibleId ?? null,
    );

    const initialStatus =
      dto.submitForApproval === false
        ? GmudStatus.DRAFT
        : GmudStatus.PENDING_APPROVAL;

    const gmud = await this.prisma.gmud.create({
      data: {
        companyId: dto.companyId,
        title: dto.title,
        downtime: dto.downtime,
        downtimeStart,
        downtimeEnd,
        responsibleId: dto.responsibleId ?? null,
        description: dto.description ?? null,
        reason: dto.reason ?? null,
        impact: dto.impact ?? null,
        rollback: dto.rollback ?? null,
        status: initialStatus,
        createdBy: user.userId,
        executors: {
          create: executorIds.map((userId) => ({
            userId,
          })),
        },
        approvers: {
          create: approverIds.map((userId) => ({
            userId,
            status: GmudApproverStatus.PENDING,
          })),
        },
        activities: dto.activities?.length
          ? {
              create: dto.activities.map((a) => ({
                scheduledAt: new Date(a.scheduledAt),
                durationMinutes: a.durationMinutes,
                executorUserId: a.executorUserId,
                description: a.description,
              })),
            }
          : undefined,
      },
      include: {
        company: { select: { id: true, name: true } },
        approvers: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    });

    if (gmud.status === GmudStatus.PENDING_APPROVAL) {
      await this.mail.notifyApproversGmudPendingApproval({
        gmudId: gmud.id,
        gmudCode: gmud.code,
        companyId: gmud.companyId,
        companyName: gmud.company.name,
        approverEmails: gmud.approvers.map((a) => a.user.email),
      });
    }

    return gmud;
  }

  async update(user: AuthenticatedRequestUser, id: string, dto: UpdateGmudDto) {
    const existing = await this.getById(user, id);

    if (!this.canEditGmudStatus(existing.status)) {
      throw new BadRequestException('GMUD não pode ser editada neste status');
    }

    const nextCompanyId = dto.companyId ?? existing.companyId;

    const downtimeStart =
      dto.downtimeStart !== undefined
        ? parseOptionalDate(dto.downtimeStart)
        : existing.downtimeStart;
    const downtimeEnd =
      dto.downtimeEnd !== undefined
        ? parseOptionalDate(dto.downtimeEnd)
        : existing.downtimeEnd;
    const nextDowntime = dto.downtime ?? existing.downtime;

    if (nextDowntime) {
      if (!downtimeStart || !downtimeEnd) {
        throw new BadRequestException(
          'Início e fim do downtime são obrigatórios',
        );
      }
      if (downtimeEnd <= downtimeStart) {
        throw new BadRequestException(
          'Fim do downtime deve ser maior que o início',
        );
      }
    }

    const nextExecutors = dto.executors
      ? dto.executors.map((e) => e.userId)
      : existing.executors.map((e) => e.user.id);
    const nextApprovers = dto.approvers
      ? dto.approvers.map((a) => a.userId)
      : existing.approvers.map((a) => a.user.id);

    if (dto.activities?.length) {
      const invalid = dto.activities.find(
        (a) => !nextExecutors.includes(a.executorUserId),
      );
      if (invalid) {
        throw new BadRequestException(
          'Executor da atividade deve ser um dos executores cadastrados na GMUD',
        );
      }
    }

    await this.validateCompanyAndUsersScope(
      user,
      nextCompanyId,
      nextExecutors,
      nextApprovers,
      dto.responsibleId !== undefined
        ? dto.responsibleId
        : (existing.responsible?.id ?? null),
    );

    const shouldSubmit =
      dto.submitForApproval === true &&
      existing.status === GmudStatus.DRAFT &&
      existing.approvers.every((a) => a.status === GmudApproverStatus.PENDING);

    const updated = await this.prisma.gmud.update({
      where: { id: existing.id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.companyId !== undefined ? { companyId: dto.companyId } : {}),
        ...(dto.downtime !== undefined ? { downtime: dto.downtime } : {}),
        ...(dto.downtimeStart !== undefined ? { downtimeStart } : {}),
        ...(dto.downtimeEnd !== undefined ? { downtimeEnd } : {}),
        ...(dto.responsibleId !== undefined
          ? { responsibleId: dto.responsibleId }
          : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.reason !== undefined ? { reason: dto.reason } : {}),
        ...(dto.impact !== undefined ? { impact: dto.impact } : {}),
        ...(dto.rollback !== undefined ? { rollback: dto.rollback } : {}),
        ...(shouldSubmit ? { status: GmudStatus.PENDING_APPROVAL } : {}),
        ...(dto.executors
          ? {
              executors: {
                deleteMany: {},
                create: dto.executors.map((e) => ({ userId: e.userId })),
              },
            }
          : {}),
        ...(dto.approvers
          ? {
              approvers: {
                deleteMany: {},
                create: dto.approvers.map((a) => ({
                  userId: a.userId,
                  status: GmudApproverStatus.PENDING,
                })),
              },
            }
          : {}),
        ...(dto.activities
          ? {
              activities: {
                deleteMany: {},
                create: dto.activities.map((a) => ({
                  scheduledAt: new Date(a.scheduledAt),
                  durationMinutes: a.durationMinutes,
                  executorUserId: a.executorUserId,
                  description: a.description,
                })),
              },
            }
          : {}),
      },
      include: {
        company: { select: { id: true, name: true } },
        approvers: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    });

    if (shouldSubmit) {
      await this.mail.notifyApproversGmudPendingApproval({
        gmudId: updated.id,
        gmudCode: updated.code,
        companyId: updated.companyId,
        companyName: updated.company.name,
        approverEmails: updated.approvers.map((a) => a.user.email),
      });
    }

    return updated;
  }

  async approve(
    user: AuthenticatedRequestUser,
    id: string,
    dto: ApproveGmudDto,
  ) {
    const gmud = await this.getById(user, id);

    if (gmud.status !== GmudStatus.PENDING_APPROVAL) {
      throw new BadRequestException('GMUD não está pendente de aprovação');
    }

    const approver = await this.prisma.gmudApprover.findFirst({
      where: { gmudId: gmud.id, userId: user.userId },
    });

    if (!approver) {
      throw new ForbiddenException('Você não é aprovador desta GMUD');
    }

    if (approver.status !== GmudApproverStatus.PENDING) {
      throw new BadRequestException('Sua decisão já foi registrada');
    }

    const nextApproverStatus =
      dto.decision === 'APPROVE'
        ? GmudApproverStatus.APPROVED
        : GmudApproverStatus.REJECTED;

    await this.prisma.gmudApprover.update({
      where: { id: approver.id },
      data: {
        status: nextApproverStatus,
        decidedAt: new Date(),
        decisionNote: dto.note ?? null,
      },
    });

    const allApprovers = await this.prisma.gmudApprover.findMany({
      where: { gmudId: gmud.id },
      select: { status: true },
    });

    const anyRejected = allApprovers.some(
      (a) => a.status === GmudApproverStatus.REJECTED,
    );
    const allApproved =
      allApprovers.length > 0 &&
      allApprovers.every((a) => a.status === GmudApproverStatus.APPROVED);

    if (anyRejected) {
      return this.prisma.gmud.update({
        where: { id: gmud.id },
        data: { status: GmudStatus.REJECTED },
      });
    }

    if (allApproved) {
      return this.prisma.gmud.update({
        where: { id: gmud.id },
        data: { status: GmudStatus.APPROVED, approvedAt: new Date() },
      });
    }

    return this.getById(user, gmud.id);
  }

  async approveOnBehalf(
    user: AuthenticatedRequestUser,
    id: string,
    dto: ApproveOnBehalfGmudDto,
    evidence?: Express.Multer.File,
  ) {
    // Regra: ADMIN pode aprovar em nome (inclui admins da Alle Tecnologia).
    if (user.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Apenas administradores podem aprovar em nome de outro usuário',
      );
    }

    const normalizeCompanyName = (raw: string) =>
      raw
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

    if (user.companyId) {
      const company = await this.prisma.company.findFirst({
        where: { id: user.companyId, deletedAt: null },
        select: { name: true },
      });
      const name = normalizeCompanyName(company?.name ?? '');
      if (name !== 'alle tecnologia') {
        throw new ForbiddenException(
          'Apenas administradores da Alle Tecnologia podem aprovar em nome de outro usuário',
        );
      }
    }

    if (!evidence) {
      throw new BadRequestException(
        'Evidência é obrigatória para aprovar em nome de outro usuário',
      );
    }

    const gmud = await this.getById(user, id);

    if (gmud.status !== GmudStatus.PENDING_APPROVAL) {
      throw new BadRequestException('GMUD não está pendente de aprovação');
    }

    const targetApprover = await this.prisma.gmudApprover.findFirst({
      where: { gmudId: gmud.id, userId: dto.onBehalfOfUserId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    if (!targetApprover) {
      throw new NotFoundException('Usuário alvo não é aprovador desta GMUD');
    }

    if (targetApprover.status !== GmudApproverStatus.PENDING) {
      throw new BadRequestException(
        'A decisão do aprovador alvo já foi registrada',
      );
    }

    const maxBytes = 10 * 1024 * 1024;
    if (evidence.size > maxBytes) {
      throw new BadRequestException('Arquivo excede o limite de 10MB');
    }
    assertAllowedUpload(evidence);

    const uploadsDir = join(
      process.cwd(),
      'uploads',
      'gmud',
      gmud.id,
      'on-behalf',
    );
    const safeName = evidence.originalname.replace(/[^\w.\-() ]+/g, '_');
    const targetName = `${randomUUID()}-${safeName}`;
    const targetPath = join(uploadsDir, targetName);
    await writeUploadedBuffer(targetPath, evidence.buffer);

    const createdFile = await this.prisma.file.create({
      data: {
        originalName: evidence.originalname,
        mimeType: evidence.mimetype,
        path: targetPath,
        size: evidence.size,
        uploadedBy: user.userId,
      },
    });

    await this.prisma.gmudAttachment.create({
      data: {
        gmudId: gmud.id,
        fileId: createdFile.id,
        uploadedBy: user.userId,
      },
    });

    const nextApproverStatus =
      dto.decision === 'APPROVE'
        ? GmudApproverStatus.APPROVED
        : GmudApproverStatus.REJECTED;

    const decisionNote = [
      dto.note?.trim() ? dto.note.trim() : null,
      `APROVADO_EM_NOME_DE:${targetApprover.user.name}(${targetApprover.user.email})`,
      `POR:${user.email}`,
      `EVIDENCIA_FILE_ID:${createdFile.id}`,
    ]
      .filter(Boolean)
      .join(' | ');

    await this.prisma.gmudApprover.update({
      where: { id: targetApprover.id },
      data: {
        status: nextApproverStatus,
        decidedAt: new Date(),
        decisionNote,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user.userId,
        action: 'GMUD_APPROVE_ON_BEHALF',
        entity: 'GMUD',
        entityId: gmud.id,
        payload: {
          gmudId: gmud.id,
          gmudCode: gmud.code,
          onBehalfOfUserId: targetApprover.user.id,
          onBehalfOfUserEmail: targetApprover.user.email,
          decision: dto.decision,
          evidenceFileId: createdFile.id,
        },
      },
    });

    const allApprovers = await this.prisma.gmudApprover.findMany({
      where: { gmudId: gmud.id },
      select: { status: true },
    });

    const anyRejected = allApprovers.some(
      (a) => a.status === GmudApproverStatus.REJECTED,
    );
    const allApproved =
      allApprovers.length > 0 &&
      allApprovers.every((a) => a.status === GmudApproverStatus.APPROVED);

    if (anyRejected) {
      return this.prisma.gmud.update({
        where: { id: gmud.id },
        data: { status: GmudStatus.REJECTED },
      });
    }

    if (allApproved) {
      return this.prisma.gmud.update({
        where: { id: gmud.id },
        data: { status: GmudStatus.APPROVED, approvedAt: new Date() },
      });
    }

    return this.getById(user, gmud.id);
  }

  async startExecution(user: AuthenticatedRequestUser, id: string) {
    const gmud = await this.getById(user, id);

    if (gmud.status !== GmudStatus.APPROVED) {
      throw new BadRequestException(
        'GMUD deve estar aprovada para iniciar execução',
      );
    }

    return this.prisma.gmud.update({
      where: { id: gmud.id },
      data: { status: GmudStatus.IN_EXECUTION, executionStartedAt: new Date() },
    });
  }

  async completeExecution(user: AuthenticatedRequestUser, id: string) {
    const gmud = await this.getById(user, id);

    if (gmud.status !== GmudStatus.IN_EXECUTION) {
      throw new BadRequestException('GMUD não está em execução');
    }

    return this.prisma.gmud.update({
      where: { id: gmud.id },
      data: { status: GmudStatus.EXECUTED, executedAt: new Date() },
    });
  }

  async cancel(user: AuthenticatedRequestUser, id: string) {
    const gmud = await this.getById(user, id);

    if (
      gmud.status === GmudStatus.EXECUTED ||
      gmud.status === GmudStatus.CANCELED
    ) {
      throw new BadRequestException('GMUD não pode ser cancelada');
    }

    return this.prisma.gmud.update({
      where: { id: gmud.id },
      data: { status: GmudStatus.CANCELED },
    });
  }

  async searchUsers(
    user: AuthenticatedRequestUser,
    query: SearchUsersQueryDto,
  ) {
    const q = query.q?.trim();
    const scopeCompanyIds = await this.getAccessibleCompanyIds(user);

    const companyId = isClientPortalRole(user.role)
      ? user.companyId
      : query.companyId
        ? query.companyId
        : null;

    if (companyId) {
      this.ensureCompanyInScope(companyId, scopeCompanyIds);
    }

    return this.prisma.user.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        ...(isClientPortalRole(user.role)
          ? { companyId: user.companyId }
          : companyId
            ? {
                OR: [
                  { companyId }, // usuários do cliente
                  { role: { in: ['ADMIN', 'COLLABORATOR', 'PJ'] } }, // internos (ex.: Alle)
                ],
              }
            : { companyId: { in: scopeCompanyIds } }),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        companyId: true,
      },
      orderBy: [{ name: 'asc' }],
      take: 20,
    });
  }

  async addAttachment(
    user: AuthenticatedRequestUser,
    id: string,
    file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Arquivo não enviado');
    }

    const gmud = await this.getById(user, id);

    if (
      gmud.status === GmudStatus.CANCELED ||
      gmud.status === GmudStatus.EXECUTED
    ) {
      throw new BadRequestException('GMUD não aceita anexos neste status');
    }

    if (file.size > UPLOAD_MAX_BYTES) {
      throw new BadRequestException('Arquivo excede o limite de 10MB');
    }
    assertAllowedUpload(file);

    const uploadsDir = join(process.cwd(), 'uploads', 'gmud', gmud.id);

    const safeName = file.originalname.replace(/[^\w.\-() ]+/g, '_');
    const targetName = `${randomUUID()}-${safeName}`;
    const targetPath = join(uploadsDir, targetName);

    await writeUploadedBuffer(targetPath, file.buffer);

    const created = await this.prisma.file.create({
      data: {
        originalName: file.originalname,
        mimeType: file.mimetype,
        path: targetPath,
        size: file.size,
        uploadedBy: user.userId,
      },
    });

    return this.prisma.gmudAttachment.create({
      data: {
        gmudId: gmud.id,
        fileId: created.id,
        uploadedBy: user.userId,
      },
      include: {
        file: true,
        uploader: { select: { id: true, name: true, email: true } },
      },
    });
  }
}
