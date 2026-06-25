import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import {
  ProjectBudgetUnit,
  ProjectCompletionApprovalStatus,
  ProjectStatus,
  UserRole,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import ExcelJS from 'exceljs';
import { join } from 'path';
import { FileStorageService } from '../../common/storage/file-storage.service';
import { assertAllowedUploadMime, UPLOAD_MAX_BYTES } from '../../common/upload.config';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import type {
  CreateProjectActivityDto,
  CreateProjectDto,
  SearchProjetosUsersQueryDto,
  UpdateProjectActivityDto,
  UpdateProjectDto,
} from './projetos.dto';

const HOURS_PER_WORK_DAY = 8;
const PROJECT_DOC_MIMES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

export type ProjectDocumentDto = {
  id: string;
  fileId: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
};

export type ProjectBudgetDto = {
  unit: ProjectBudgetUnit | null;
  amount: number | null;
  consumedDays: number;
  consumedHours: number;
  consumedInUnit: number | null;
  exceeded: boolean;
  unitLabel: string;
};

export type ProjectCompletionApprovalDto = {
  status: ProjectCompletionApprovalStatus;
  approvedByName: string | null;
  approvedAt: string | null;
  note: string | null;
};

export type ProjectActivityDto = {
  id: string;
  projectId: string;
  parentId: string | null;
  wbsCode: string;
  name: string;
  level: number;
  sortOrder: number;
  durationDays: number;
  startDate: string | null;
  endDate: string | null;
  actualDurationDays: number | null;
  progressPercent: number;
  assigneeUserId: string | null;
  assigneeName: string | null;
  assigneeDisplayName: string | null;
  isMilestone: boolean;
  notes: string | null;
  predecessorIds: string[];
  children: ProjectActivityDto[];
};

export type ProjectSummaryDto = {
  id: string;
  code: number;
  companyId: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  startDate: string | null;
  endDate: string | null;
  progressPercent: number;
  activitiesCount: number;
  budget: ProjectBudgetDto;
  completionApproval: ProjectCompletionApprovalDto;
  documentsCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ProjectDetailDto = ProjectSummaryDto & {
  company: { id: string; name: string };
  activities: ProjectActivityDto[];
  documents: ProjectDocumentDto[];
};

type ActivityRow = {
  id: string;
  projectId: string;
  parentId: string | null;
  wbsCode: string;
  name: string;
  level: number;
  sortOrder: number;
  durationDays: number;
  startDate: Date | null;
  endDate: Date | null;
  actualDurationDays: number | null;
  progressPercent: number;
  assigneeUserId: string | null;
  assigneeName: string | null;
  isMilestone: boolean;
  notes: string | null;
  assignee: { name: string } | null;
  predecessors: Array<{ predecessorId: string }>;
};

@Injectable()
export class ProjetosExcelService {
  constructor(private readonly prisma: PrismaService) {}

  async buildExportBuffer(params: {
    project?: ProjectDetailDto;
    companyName: string;
    template: boolean;
  }): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Alle One';

    const instructions = workbook.addWorksheet('Instruções');
    instructions.addRow(['Como usar esta planilha']);
    instructions.addRow([
      '1. Preencha a aba Atividades com WBS, nome, duração em dias, datas (AAAA-MM-DD), responsável (e-mail ou nome livre), % andamento, tempo real (dias) e predecessoras (WBS separadas por ;).',
    ]);
    instructions.addRow([
      '2. Sub-atividades: informe o WBS do pai na coluna "WBS pai".',
    ]);
    instructions.addRow([
      '3. Importação disponível apenas para equipe interna (não cliente).',
    ]);
    instructions.getColumn(1).width = 100;

    const sheet = workbook.addWorksheet('Atividades');
    const headers = [
      'WBS',
      'WBS pai',
      'Nome da tarefa',
      'Duração (dias)',
      'Início',
      'Término',
      'Responsável',
      'E-mail responsável',
      '% Andamento',
      'Tempo real (dias)',
      'Predecessoras (WBS)',
      'Marco (S/N)',
      'Observações',
    ];
    sheet.addRow(headers);
    sheet.getRow(1).font = { bold: true };
    headers.forEach((_, index) => {
      sheet.getColumn(index + 1).width = index === 2 ? 36 : 18;
    });

    if (!params.template && params.project) {
      const flat = this.flattenActivities(params.project.activities);
      for (const row of flat) {
        sheet.addRow([
          row.wbsCode,
          row.parentWbs ?? '',
          row.name,
          row.durationDays,
          row.startDate ?? '',
          row.endDate ?? '',
          row.assigneeDisplayName ?? row.assigneeName ?? '',
          row.assigneeEmail ?? '',
          row.progressPercent,
          row.actualDurationDays ?? '',
          row.predecessorWbs.join('; '),
          row.isMilestone ? 'S' : 'N',
          row.notes ?? '',
        ]);
      }

      const summary = workbook.addWorksheet('Resumo');
      summary.addRow(['Empresa', params.companyName]);
      summary.addRow(['Projeto', `#${params.project.code} — ${params.project.name}`]);
      summary.addRow(['Status', params.project.status]);
      summary.addRow(['Andamento', `${params.project.progressPercent}%`]);
      summary.addRow(['Início', params.project.startDate ?? '']);
      summary.addRow(['Término', params.project.endDate ?? '']);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async importFromBuffer(params: {
    projectId: string;
    buffer: Buffer;
  }): Promise<{
    created: number;
    updated: number;
    errors: Array<{ row: number; message: string }>;
  }> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(params.buffer) as unknown as ExcelJS.Buffer);
    const sheet =
      workbook.getWorksheet('Atividades') ?? workbook.worksheets[0];
    if (!sheet) {
      throw new BadRequestException('Planilha sem aba de atividades.');
    }

    const project = await this.prisma.project.findFirst({
      where: { id: params.projectId, deletedAt: null },
      select: { id: true },
    });
    if (!project) {
      throw new NotFoundException('Projeto não encontrado.');
    }

    const rows: Array<{
      rowNumber: number;
      wbsCode: string;
      parentWbs: string | null;
      name: string;
      durationDays: number;
      startDate: Date | null;
      endDate: Date | null;
      assigneeEmail: string | null;
      assigneeName: string | null;
      progressPercent: number;
      actualDurationDays: number | null;
      predecessorWbs: string[];
      isMilestone: boolean;
      notes: string | null;
    }> = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const wbsCode = String(row.getCell(1).text ?? '').trim();
      const name = String(row.getCell(3).text ?? '').trim();
      if (!wbsCode && !name) return;
      if (!wbsCode || !name) {
        return;
      }
      const parentWbsRaw = String(row.getCell(2).text ?? '').trim();
      const durationDays = Math.max(
        0,
        Math.trunc(Number(row.getCell(4).value) || 0),
      );
      const startDate = this.parseExcelDate(row.getCell(5).value);
      const endDate = this.parseExcelDate(row.getCell(6).value);
      const assigneeName = String(row.getCell(7).text ?? '').trim() || null;
      const assigneeEmail = String(row.getCell(8).text ?? '').trim() || null;
      const progressPercent = Math.min(
        100,
        Math.max(0, Math.trunc(Number(row.getCell(9).value) || 0)),
      );
      const actualRaw = row.getCell(10).value;
      const actualDurationDays =
        actualRaw == null || actualRaw === ''
          ? null
          : Math.max(0, Math.trunc(Number(actualRaw) || 0));
      const predecessorWbs = String(row.getCell(11).text ?? '')
        .split(';')
        .map((part) => part.trim())
        .filter(Boolean);
      const isMilestone = ['s', 'sim', 'yes', 'y', '1', 'true'].includes(
        String(row.getCell(12).text ?? '')
          .trim()
          .toLowerCase(),
      );
      const notes = String(row.getCell(13).text ?? '').trim() || null;

      rows.push({
        rowNumber,
        wbsCode,
        parentWbs: parentWbsRaw || null,
        name,
        durationDays: isMilestone ? 0 : durationDays || 1,
        startDate,
        endDate,
        assigneeEmail,
        assigneeName,
        progressPercent,
        actualDurationDays,
        predecessorWbs,
        isMilestone,
        notes,
      });
    });

    const errors: Array<{ row: number; message: string }> = [];
    let created = 0;
    let updated = 0;

    await this.prisma.$transaction(async (tx) => {
      const wbsToId = new Map<string, string>();
      const existing = await tx.projectActivity.findMany({
        where: { projectId: params.projectId, deletedAt: null },
        select: { id: true, wbsCode: true },
      });
      for (const item of existing) {
        wbsToId.set(item.wbsCode, item.id);
      }

      const sorted = [...rows].sort(
        (a, b) => a.wbsCode.split('.').length - b.wbsCode.split('.').length,
      );

      for (const row of sorted) {
        try {
          let parentId: string | null = null;
          if (row.parentWbs) {
            parentId = wbsToId.get(row.parentWbs) ?? null;
            if (!parentId) {
              errors.push({
                row: row.rowNumber,
                message: `WBS pai "${row.parentWbs}" não encontrado.`,
              });
              continue;
            }
          }

          let assigneeUserId: string | null = null;
          if (row.assigneeEmail) {
            const user = await tx.user.findFirst({
              where: {
                email: { equals: row.assigneeEmail, mode: 'insensitive' },
                deletedAt: null,
                status: 'ACTIVE',
              },
              select: { id: true, name: true },
            });
            if (user) {
              assigneeUserId = user.id;
            }
          }

          const level = row.wbsCode.split('.').length;
          const existingId = wbsToId.get(row.wbsCode);
          const data = {
            parentId,
            name: row.name,
            level,
            durationDays: row.durationDays,
            startDate: row.startDate,
            endDate: row.endDate,
            actualDurationDays: row.actualDurationDays,
            progressPercent: row.progressPercent,
            assigneeUserId,
            assigneeName: assigneeUserId ? null : row.assigneeName,
            isMilestone: row.isMilestone,
            notes: row.notes,
          };

          let activityId: string;
          if (existingId) {
            await tx.projectActivity.update({
              where: { id: existingId },
              data,
            });
            activityId = existingId;
            updated += 1;
          } else {
            const maxSort = await tx.projectActivity.aggregate({
              where: {
                projectId: params.projectId,
                parentId,
                deletedAt: null,
              },
              _max: { sortOrder: true },
            });
            activityId = randomUUID();
            await tx.projectActivity.create({
              data: {
                id: activityId,
                projectId: params.projectId,
                wbsCode: row.wbsCode,
                sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
                ...data,
              },
            });
            wbsToId.set(row.wbsCode, activityId);
            created += 1;
          }

          await tx.projectActivityPredecessor.deleteMany({
            where: { activityId },
          });
          for (const predWbs of row.predecessorWbs) {
            const predId = wbsToId.get(predWbs);
            if (!predId) {
              errors.push({
                row: row.rowNumber,
                message: `Predecessora WBS "${predWbs}" não encontrada.`,
              });
              continue;
            }
            if (predId === activityId) continue;
            await tx.projectActivityPredecessor.create({
              data: { activityId, predecessorId: predId },
            });
          }
        } catch (err) {
          errors.push({
            row: row.rowNumber,
            message:
              err instanceof Error ? err.message : 'Erro ao importar linha.',
          });
        }
      }
    });

    return { created, updated, errors };
  }

  private parseExcelDate(value: unknown): Date | null {
    if (value == null || value === '') return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      const d = new Date(value);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    const text = String(value).trim();
    if (!text) return null;
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00.000Z` : text;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  private flattenActivities(
    nodes: ProjectActivityDto[],
    parentWbs: string | null = null,
  ): Array<
    ProjectActivityDto & {
      parentWbs: string | null;
      predecessorWbs: string[];
      assigneeEmail?: string | null;
    }
  > {
    const wbsById = new Map<string, string>();
    const walkCollect = (items: ProjectActivityDto[]) => {
      for (const item of items) {
        wbsById.set(item.id, item.wbsCode);
        if (item.children.length) walkCollect(item.children);
      }
    };
    walkCollect(nodes);

    const result: Array<
      ProjectActivityDto & {
        parentWbs: string | null;
        predecessorWbs: string[];
      }
    > = [];
    const walk = (items: ProjectActivityDto[], parent: string | null) => {
      for (const item of items) {
        result.push({
          ...item,
          parentWbs: parent,
          predecessorWbs: item.predecessorIds
            .map((id) => wbsById.get(id))
            .filter((wbs): wbs is string => Boolean(wbs)),
        });
        if (item.children.length) walk(item.children, item.wbsCode);
      }
    };
    walk(nodes, parentWbs);
    return result;
  }
}

@Injectable()
export class ProjetosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly excel: ProjetosExcelService,
    private readonly fileStorage: FileStorageService,
  ) {}

  private assertCanMutate(user: AuthenticatedRequestUser) {
    if (user.role === UserRole.CLIENT) {
      throw new ForbiddenException('Cliente pode apenas visualizar e exportar projetos.');
    }
  }

  private assertCanImport(user: AuthenticatedRequestUser) {
    if (user.role === UserRole.CLIENT) {
      throw new ForbiddenException('Cliente não pode importar planilhas de projetos.');
    }
  }

  private assertAdmin(user: AuthenticatedRequestUser) {
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Apenas administradores podem executar esta ação.');
    }
  }

  private assertProjectDocumentMime(mimeType: string | undefined | null) {
    assertAllowedUploadMime(mimeType);
    const mime = (mimeType || '').toLowerCase();
    const ok = PROJECT_DOC_MIMES.some((allowed) => mime === allowed || mime.startsWith(allowed));
    if (!ok) {
      throw new BadRequestException(
        'Documentação do projeto: use PDF ou Word (.pdf, .doc, .docx).',
      );
    }
  }

  private computeBudgetMetrics(activities: ActivityRow[]) {
    let consumedDays = 0;
    for (const row of activities) {
      if (row.isMilestone) continue;
      const days =
        row.actualDurationDays ??
        (row.progressPercent >= 100 ? row.durationDays : 0);
      consumedDays += Math.max(0, days);
    }
    const consumedHours = consumedDays * HOURS_PER_WORK_DAY;
    return { consumedDays, consumedHours };
  }

  private consumedInUnit(
    metrics: { consumedDays: number; consumedHours: number },
    unit: ProjectBudgetUnit | null | undefined,
  ): number | null {
    if (!unit) return null;
    return unit === ProjectBudgetUnit.HOURS
      ? metrics.consumedHours
      : metrics.consumedDays;
  }

  private buildBudgetDto(
    project: {
      budgetUnit: ProjectBudgetUnit | null;
      budgetAmount: number | null;
    },
    activities: ActivityRow[],
  ): ProjectBudgetDto {
    const metrics = this.computeBudgetMetrics(activities);
    const consumedInUnit = this.consumedInUnit(metrics, project.budgetUnit);
    const exceeded =
      project.budgetAmount != null &&
      consumedInUnit != null &&
      consumedInUnit > project.budgetAmount;
    return {
      unit: project.budgetUnit,
      amount: project.budgetAmount,
      consumedDays: metrics.consumedDays,
      consumedHours: metrics.consumedHours,
      consumedInUnit,
      exceeded,
      unitLabel: project.budgetUnit === ProjectBudgetUnit.HOURS ? 'horas' : 'dias',
    };
  }

  private buildCompletionApprovalDto(project: {
    completionApprovalStatus: ProjectCompletionApprovalStatus;
    completionApprovalNote: string | null;
    completionApprovedAt: Date | null;
    completionApprover?: { name: string } | null;
  }): ProjectCompletionApprovalDto {
    return {
      status: project.completionApprovalStatus,
      approvedByName: project.completionApprover?.name ?? null,
      approvedAt: project.completionApprovedAt?.toISOString() ?? null,
      note: project.completionApprovalNote,
    };
  }

  private async loadProjectDocuments(projectId: string): Promise<ProjectDocumentDto[]> {
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

  private async saveProjectDocuments(
    user: AuthenticatedRequestUser,
    projectId: string,
    files: Express.Multer.File[],
  ) {
    for (const file of files) {
      this.assertProjectDocumentMime(file.mimetype);
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

  private async assertCanCompleteProject(
    project: {
      id: string;
      budgetUnit: ProjectBudgetUnit | null;
      budgetAmount: number | null;
      completionApprovalStatus: ProjectCompletionApprovalStatus;
    },
    activities: ActivityRow[],
  ) {
    if (!project.budgetAmount || !project.budgetUnit) return;

    const budget = this.buildBudgetDto(project, activities);
    if (!budget.exceeded) {
      if (
        project.completionApprovalStatus === ProjectCompletionApprovalStatus.PENDING
      ) {
        await this.prisma.project.update({
          where: { id: project.id },
          data: {
            completionApprovalStatus: ProjectCompletionApprovalStatus.NOT_REQUIRED,
          },
        });
      }
      return;
    }

    if (
      project.completionApprovalStatus !== ProjectCompletionApprovalStatus.APPROVED
    ) {
      await this.prisma.project.update({
        where: { id: project.id },
        data: {
          completionApprovalStatus: ProjectCompletionApprovalStatus.PENDING,
        },
      });
      throw new BadRequestException(
        `Tempo consumido (${budget.consumedInUnit} ${budget.unitLabel}) excede o orçamento (${project.budgetAmount} ${budget.unitLabel}). Um administrador precisa aprovar antes de concluir o projeto.`,
      );
    }
  }

  async getAccessibleCompanyIds(user: AuthenticatedRequestUser): Promise<string[]> {
    if (user.role === UserRole.CLIENT) {
      if (!user.companyId) {
        throw new ForbiddenException('Usuário sem empresa vinculada.');
      }
      return [user.companyId];
    }
    const companies = await this.prisma.company.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });
    return companies.map((c) => c.id);
  }

  private ensureCompanyInScope(companyId: string, scope: string[]) {
    if (!scope.includes(companyId)) {
      throw new ForbiddenException('Sem acesso à empresa informada.');
    }
  }

  private formatDateOnly(value: Date | null | undefined): string | null {
    if (!value) return null;
    return value.toISOString().slice(0, 10);
  }

  private computeProgress(activities: ActivityRow[]): number {
    const leaves = activities.filter(
      (a) => !activities.some((child) => child.parentId === a.id),
    );
    const pool = leaves.length ? leaves : activities;
    if (!pool.length) return 0;
    const totalWeight = pool.reduce(
      (sum, row) => sum + Math.max(1, row.durationDays || (row.isMilestone ? 0 : 1)),
      0,
    );
    if (!totalWeight) {
      return Math.round(
        pool.reduce((sum, row) => sum + row.progressPercent, 0) / pool.length,
      );
    }
    const weighted = pool.reduce(
      (sum, row) =>
        sum +
        row.progressPercent *
          Math.max(1, row.durationDays || (row.isMilestone ? 0 : 1)),
      0,
    );
    return Math.min(100, Math.round(weighted / totalWeight));
  }

  private mapActivityRow(row: ActivityRow): Omit<ProjectActivityDto, 'children'> {
    return {
      id: row.id,
      projectId: row.projectId,
      parentId: row.parentId,
      wbsCode: row.wbsCode,
      name: row.name,
      level: row.level,
      sortOrder: row.sortOrder,
      durationDays: row.durationDays,
      startDate: this.formatDateOnly(row.startDate),
      endDate: this.formatDateOnly(row.endDate),
      actualDurationDays: row.actualDurationDays,
      progressPercent: row.progressPercent,
      assigneeUserId: row.assigneeUserId,
      assigneeName: row.assigneeName,
      assigneeDisplayName: row.assignee?.name ?? row.assigneeName,
      isMilestone: row.isMilestone,
      notes: row.notes,
      predecessorIds: row.predecessors.map((p) => p.predecessorId),
    };
  }

  private buildActivityTree(rows: ActivityRow[]): ProjectActivityDto[] {
    const mapped = rows.map((row) => ({
      ...this.mapActivityRow(row),
      children: [] as ProjectActivityDto[],
    }));
    const byId = new Map(mapped.map((row) => [row.id, row]));
    const roots: ProjectActivityDto[] = [];
    for (const row of mapped) {
      if (row.parentId && byId.has(row.parentId)) {
        byId.get(row.parentId)!.children.push(row);
      } else {
        roots.push(row);
      }
    }
    const sortRec = (nodes: ProjectActivityDto[]) => {
      nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.wbsCode.localeCompare(b.wbsCode));
      nodes.forEach((node) => sortRec(node.children));
    };
    sortRec(roots);
    return roots;
  }

  private async loadProjectActivities(projectId: string): Promise<ActivityRow[]> {
    return this.prisma.projectActivity.findMany({
      where: { projectId, deletedAt: null },
      orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }, { wbsCode: 'asc' }],
      include: {
        assignee: { select: { name: true } },
        predecessors: { select: { predecessorId: true } },
      },
    });
  }

  private async resolveProjectInScope(
    user: AuthenticatedRequestUser,
    projectId: string,
  ) {
    const scope = await this.getAccessibleCompanyIds(user);
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      include: {
        company: { select: { id: true, name: true } },
      },
    });
    if (!project) {
      throw new NotFoundException('Projeto não encontrado.');
    }
    this.ensureCompanyInScope(project.companyId, scope);
    return project;
  }

  async listCompanies(user: AuthenticatedRequestUser) {
    const scope = await this.getAccessibleCompanyIds(user);
    const companies = await this.prisma.company.findMany({
      where: { id: { in: scope }, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    const counts = await this.prisma.project.groupBy({
      by: ['companyId'],
      where: { companyId: { in: scope }, deletedAt: null },
      _count: { _all: true },
    });
    const countMap = new Map(counts.map((c) => [c.companyId, c._count._all]));
    return companies.map((company) => ({
      id: company.id,
      name: company.name,
      projectsCount: countMap.get(company.id) ?? 0,
    }));
  }

  async listProjects(user: AuthenticatedRequestUser, companyId: string) {
    const scope = await this.getAccessibleCompanyIds(user);
    this.ensureCompanyInScope(companyId, scope);
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!company) {
      throw new NotFoundException('Empresa não encontrada.');
    }

    const projects = await this.prisma.project.findMany({
      where: { companyId, deletedAt: null },
      orderBy: [{ updatedAt: 'desc' }, { code: 'desc' }],
    });

    const summaries: ProjectSummaryDto[] = [];
    for (const project of projects) {
      const activities = await this.loadProjectActivities(project.id);
      const documentsCount = await this.prisma.projectDocument.count({
        where: { projectId: project.id },
      });
      summaries.push({
        id: project.id,
        code: project.code,
        companyId: project.companyId,
        name: project.name,
        description: project.description,
        status: project.status,
        startDate: this.formatDateOnly(project.startDate),
        endDate: this.formatDateOnly(project.endDate),
        progressPercent: this.computeProgress(activities),
        activitiesCount: activities.length,
        budget: this.buildBudgetDto(project, activities),
        completionApproval: this.buildCompletionApprovalDto(project),
        documentsCount,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
      });
    }

    return { company, projects: summaries };
  }

  async getProject(user: AuthenticatedRequestUser, projectId: string): Promise<ProjectDetailDto> {
    const project = await this.resolveProjectInScope(user, projectId);
    const full = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      include: {
        company: { select: { id: true, name: true } },
        completionApprover: { select: { name: true } },
      },
    });
    if (!full) {
      throw new NotFoundException('Projeto não encontrado.');
    }
    const activities = await this.loadProjectActivities(project.id);
    const documents = await this.loadProjectDocuments(project.id);
    return {
      id: full.id,
      code: full.code,
      companyId: full.companyId,
      name: full.name,
      description: full.description,
      status: full.status,
      startDate: this.formatDateOnly(full.startDate),
      endDate: this.formatDateOnly(full.endDate),
      progressPercent: this.computeProgress(activities),
      activitiesCount: activities.length,
      budget: this.buildBudgetDto(full, activities),
      completionApproval: this.buildCompletionApprovalDto(full),
      documentsCount: documents.length,
      createdAt: full.createdAt.toISOString(),
      updatedAt: full.updatedAt.toISOString(),
      company: full.company,
      activities: this.buildActivityTree(activities),
      documents,
    };
  }

  async createProject(
    user: AuthenticatedRequestUser,
    companyId: string,
    body: CreateProjectDto,
    files: Express.Multer.File[] = [],
  ) {
    this.assertCanMutate(user);
    const scope = await this.getAccessibleCompanyIds(user);
    this.ensureCompanyInScope(companyId, scope);

    const project = await this.prisma.project.create({
      data: {
        companyId,
        name: body.name.trim(),
        description: body.description?.trim() || null,
        status: (body.status as ProjectStatus | undefined) ?? ProjectStatus.PLANNING,
        startDate: body.startDate ? new Date(`${body.startDate}T00:00:00.000Z`) : null,
        endDate: body.endDate ? new Date(`${body.endDate}T00:00:00.000Z`) : null,
        budgetUnit: body.budgetUnit as ProjectBudgetUnit,
        budgetAmount: body.budgetAmount,
        createdBy: user.userId,
      },
    });

    if (files.length) {
      await this.saveProjectDocuments(user, project.id, files);
    }

    return this.getProject(user, project.id);
  }

  async addProjectDocuments(
    user: AuthenticatedRequestUser,
    projectId: string,
    files: Express.Multer.File[],
  ) {
    this.assertCanMutate(user);
    await this.resolveProjectInScope(user, projectId);
    if (!files.length) {
      throw new BadRequestException('Envie ao menos um arquivo PDF ou Word.');
    }
    await this.saveProjectDocuments(user, projectId, files);
    return this.getProject(user, projectId);
  }

  async downloadProjectDocument(
    user: AuthenticatedRequestUser,
    projectId: string,
    documentId: string,
  ) {
    await this.resolveProjectInScope(user, projectId);
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

  async approveProjectCompletion(
    user: AuthenticatedRequestUser,
    projectId: string,
    note?: string,
  ) {
    this.assertAdmin(user);
    await this.resolveProjectInScope(user, projectId);
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
    });
    if (!project) {
      throw new NotFoundException('Projeto não encontrado.');
    }
    if (
      project.completionApprovalStatus !== ProjectCompletionApprovalStatus.PENDING
    ) {
      throw new BadRequestException('Este projeto não possui aprovação pendente.');
    }
    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        completionApprovalStatus: ProjectCompletionApprovalStatus.APPROVED,
        completionApprovedBy: user.userId,
        completionApprovedAt: new Date(),
        completionApprovalNote: note?.trim() || null,
      },
    });
    return this.getProject(user, projectId);
  }

  async updateProject(
    user: AuthenticatedRequestUser,
    projectId: string,
    body: UpdateProjectDto,
  ) {
    this.assertCanMutate(user);
    const project = await this.resolveProjectInScope(user, projectId);
    const activities = await this.loadProjectActivities(projectId);

    if (body.status === ProjectStatus.COMPLETED) {
      await this.assertCanCompleteProject(project, activities);
    }

    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.description !== undefined
          ? { description: body.description?.trim() || null }
          : {}),
        ...(body.status !== undefined ? { status: body.status as ProjectStatus } : {}),
        ...(body.startDate !== undefined
          ? {
              startDate: body.startDate
                ? new Date(`${body.startDate}T00:00:00.000Z`)
                : null,
            }
          : {}),
        ...(body.endDate !== undefined
          ? {
              endDate: body.endDate
                ? new Date(`${body.endDate}T00:00:00.000Z`)
                : null,
            }
          : {}),
        ...(body.budgetUnit !== undefined
          ? { budgetUnit: body.budgetUnit as ProjectBudgetUnit }
          : {}),
        ...(body.budgetAmount !== undefined
          ? { budgetAmount: body.budgetAmount }
          : {}),
      },
    });
    return this.getProject(user, projectId);
  }

  async deleteProject(user: AuthenticatedRequestUser, projectId: string) {
    this.assertCanMutate(user);
    await this.resolveProjectInScope(user, projectId);
    await this.prisma.project.update({
      where: { id: projectId },
      data: { deletedAt: new Date() },
    });
    return { ok: true };
  }

  private async nextWbsCode(projectId: string, parentId: string | null) {
    if (!parentId) {
      const roots = await this.prisma.projectActivity.findMany({
        where: { projectId, parentId: null, deletedAt: null },
        select: { wbsCode: true },
      });
      const nums = roots
        .map((r) => Number(r.wbsCode.split('.')[0]))
        .filter((n) => Number.isFinite(n));
      const next = (nums.length ? Math.max(...nums) : 0) + 1;
      return String(next);
    }
    const parent = await this.prisma.projectActivity.findFirst({
      where: { id: parentId, projectId, deletedAt: null },
      select: { wbsCode: true, level: true },
    });
    if (!parent) {
      throw new BadRequestException('Atividade pai inválida.');
    }
    const siblings = await this.prisma.projectActivity.findMany({
      where: { projectId, parentId, deletedAt: null },
      select: { wbsCode: true },
    });
    const suffixes = siblings
      .map((s) => Number(s.wbsCode.split('.').pop()))
      .filter((n) => Number.isFinite(n));
    const next = (suffixes.length ? Math.max(...suffixes) : 0) + 1;
    return `${parent.wbsCode}.${next}`;
  }

  private async validatePredecessors(params: {
    projectId: string;
    activityId?: string;
    predecessorIds: string[];
    parentId: string | null;
  }) {
    const unique = [...new Set(params.predecessorIds.filter(Boolean))];
    if (params.activityId && unique.includes(params.activityId)) {
      throw new BadRequestException('Atividade não pode ser predecessora de si mesma.');
    }
    if (!unique.length) return;

    const rows = await this.prisma.projectActivity.findMany({
      where: {
        projectId: params.projectId,
        id: { in: unique },
        deletedAt: null,
      },
      select: { id: true, parentId: true },
    });
    if (rows.length !== unique.length) {
      throw new BadRequestException('Predecessora inválida para este projeto.');
    }

    if (!params.activityId) return;

    const all = await this.prisma.projectActivity.findMany({
      where: { projectId: params.projectId, deletedAt: null },
      select: { id: true, parentId: true },
    });
    const descendants = new Set<string>();
    const collectDesc = (id: string) => {
      for (const row of all) {
        if (row.parentId === id && !descendants.has(row.id)) {
          descendants.add(row.id);
          collectDesc(row.id);
        }
      }
    };
    collectDesc(params.activityId);
    if (unique.some((id) => descendants.has(id))) {
      throw new BadRequestException(
        'Predecessora não pode ser sub-atividade da tarefa atual.',
      );
    }

    const edges = await this.prisma.projectActivityPredecessor.findMany({
      where: {
        activity: { projectId: params.projectId, deletedAt: null },
      },
      select: { activityId: true, predecessorId: true },
    });
    const adj = new Map<string, string[]>();
    for (const edge of edges) {
      if (edge.activityId === params.activityId) continue;
      const list = adj.get(edge.activityId) ?? [];
      list.push(edge.predecessorId);
      adj.set(edge.activityId, list);
    }
    for (const predId of unique) {
      adj.set(params.activityId!, [...(adj.get(params.activityId!) ?? []), predId]);
    }
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const dfs = (node: string): boolean => {
      if (visiting.has(node)) return true;
      if (visited.has(node)) return false;
      visiting.add(node);
      for (const next of adj.get(node) ?? []) {
        if (dfs(next)) return true;
      }
      visiting.delete(node);
      visited.add(node);
      return false;
    };
    if (dfs(params.activityId)) {
      throw new BadRequestException('Dependência circular entre predecessoras.');
    }
  }

  private resolveDates(params: {
    startDate?: string;
    endDate?: string;
    durationDays: number;
    isMilestone: boolean;
  }) {
    let start: Date | null = params.startDate
      ? new Date(`${params.startDate}T00:00:00.000Z`)
      : null;
    let end: Date | null = params.endDate
      ? new Date(`${params.endDate}T00:00:00.000Z`)
      : null;
    const duration = params.isMilestone ? 0 : Math.max(0, params.durationDays);

    if (start && !end && duration > 0) {
      end = new Date(start);
      end.setUTCDate(end.getUTCDate() + duration - 1);
    } else if (!start && end && duration > 0) {
      start = new Date(end);
      start.setUTCDate(start.getUTCDate() - (duration - 1));
    } else if (start && end && duration === 0) {
      end = start;
    }
    return { startDate: start, endDate: end, durationDays: duration };
  }

  async createActivity(
    user: AuthenticatedRequestUser,
    projectId: string,
    body: CreateProjectActivityDto,
  ) {
    this.assertCanMutate(user);
    const project = await this.resolveProjectInScope(user, projectId);
    const parentId = body.parentId ?? null;
    if (parentId) {
      const parent = await this.prisma.projectActivity.findFirst({
        where: { id: parentId, projectId, deletedAt: null },
      });
      if (!parent) {
        throw new BadRequestException('Atividade pai inválida.');
      }
    }

    await this.validatePredecessors({
      projectId,
      predecessorIds: body.predecessorIds ?? [],
      parentId,
    });

    const wbsCode = await this.nextWbsCode(projectId, parentId);
    const level = wbsCode.split('.').length;
    const isMilestone = Boolean(body.isMilestone);
    const durationDays = isMilestone ? 0 : Math.max(0, body.durationDays ?? 1);
    const dates = this.resolveDates({
      startDate: body.startDate,
      endDate: body.endDate,
      durationDays,
      isMilestone,
    });

    const maxSort = await this.prisma.projectActivity.aggregate({
      where: { projectId, parentId, deletedAt: null },
      _max: { sortOrder: true },
    });

    const activity = await this.prisma.projectActivity.create({
      data: {
        projectId,
        parentId,
        wbsCode,
        name: body.name.trim(),
        level,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
        durationDays: dates.durationDays,
        startDate: dates.startDate,
        endDate: dates.endDate,
        actualDurationDays: body.actualDurationDays ?? null,
        progressPercent: body.progressPercent ?? 0,
        assigneeUserId: body.assigneeUserId ?? null,
        assigneeName: body.assigneeUserId ? null : body.assigneeName?.trim() || null,
        isMilestone,
        notes: body.notes?.trim() || null,
      },
    });

    for (const predecessorId of body.predecessorIds ?? []) {
      await this.prisma.projectActivityPredecessor.create({
        data: { activityId: activity.id, predecessorId },
      });
    }

    if (!project.startDate && dates.startDate) {
      await this.prisma.project.update({
        where: { id: projectId },
        data: { startDate: dates.startDate },
      });
    }
    if (dates.endDate) {
      const currentEnd = project.endDate;
      if (!currentEnd || dates.endDate > currentEnd) {
        await this.prisma.project.update({
          where: { id: projectId },
          data: { endDate: dates.endDate },
        });
      }
    }

    return this.getProject(user, projectId);
  }

  async updateActivity(
    user: AuthenticatedRequestUser,
    activityId: string,
    body: UpdateProjectActivityDto,
  ) {
    this.assertCanMutate(user);
    const current = await this.prisma.projectActivity.findFirst({
      where: { id: activityId, deletedAt: null },
      include: { project: true },
    });
    if (!current) {
      throw new NotFoundException('Atividade não encontrada.');
    }
    await this.resolveProjectInScope(user, current.projectId);

    if (body.predecessorIds) {
      await this.validatePredecessors({
        projectId: current.projectId,
        activityId,
        predecessorIds: body.predecessorIds,
        parentId: current.parentId,
      });
    }

    const isMilestone =
      body.isMilestone !== undefined ? body.isMilestone : current.isMilestone;
    const durationDays =
      body.durationDays !== undefined
        ? isMilestone
          ? 0
          : Math.max(0, body.durationDays)
        : current.durationDays;
    const dates = this.resolveDates({
      startDate: body.startDate ?? this.formatDateOnly(current.startDate) ?? undefined,
      endDate: body.endDate ?? this.formatDateOnly(current.endDate) ?? undefined,
      durationDays,
      isMilestone,
    });

    await this.prisma.projectActivity.update({
      where: { id: activityId },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        durationDays: dates.durationDays,
        startDate: dates.startDate,
        endDate: dates.endDate,
        ...(body.actualDurationDays !== undefined
          ? { actualDurationDays: body.actualDurationDays }
          : {}),
        ...(body.progressPercent !== undefined
          ? { progressPercent: body.progressPercent }
          : {}),
        ...(body.assigneeUserId !== undefined
          ? {
              assigneeUserId: body.assigneeUserId,
              assigneeName: body.assigneeUserId ? null : body.assigneeName ?? null,
            }
          : body.assigneeName !== undefined
            ? { assigneeName: body.assigneeName?.trim() || null }
            : {}),
        ...(body.isMilestone !== undefined ? { isMilestone: body.isMilestone } : {}),
        ...(body.notes !== undefined ? { notes: body.notes?.trim() || null } : {}),
      },
    });

    if (body.predecessorIds) {
      await this.prisma.projectActivityPredecessor.deleteMany({
        where: { activityId },
      });
      for (const predecessorId of body.predecessorIds) {
        await this.prisma.projectActivityPredecessor.create({
          data: { activityId, predecessorId },
        });
      }
    }

    return this.getProject(user, current.projectId);
  }

  async deleteActivity(user: AuthenticatedRequestUser, activityId: string) {
    this.assertCanMutate(user);
    const current = await this.prisma.projectActivity.findFirst({
      where: { id: activityId, deletedAt: null },
      select: { id: true, projectId: true },
    });
    if (!current) {
      throw new NotFoundException('Atividade não encontrada.');
    }
    await this.resolveProjectInScope(user, current.projectId);
    const now = new Date();
    const markDeleted = async (id: string) => {
      await this.prisma.projectActivity.update({
        where: { id },
        data: { deletedAt: now },
      });
      const children = await this.prisma.projectActivity.findMany({
        where: { parentId: id, deletedAt: null },
        select: { id: true },
      });
      for (const child of children) {
        await markDeleted(child.id);
      }
    };
    await markDeleted(activityId);
    return this.getProject(user, current.projectId);
  }

  async searchUsers(
    user: AuthenticatedRequestUser,
    query: SearchProjetosUsersQueryDto,
  ) {
    const q = query.q?.trim();
    const scope = await this.getAccessibleCompanyIds(user);
    const companyId =
      user.role === UserRole.CLIENT ? user.companyId : query.companyId ?? null;
    if (companyId) {
      this.ensureCompanyInScope(companyId, scope);
    }

    return this.prisma.user.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        ...(user.role === UserRole.CLIENT
          ? { companyId: user.companyId }
          : companyId
            ? {
                OR: [
                  { companyId },
                  { role: { in: [UserRole.ADMIN, UserRole.COLLABORATOR, UserRole.PJ] } },
                ],
              }
            : { companyId: { in: scope } }),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: 'asc' },
      take: 25,
    });
  }

  async exportProject(
    user: AuthenticatedRequestUser,
    projectId: string,
    template: boolean,
  ) {
    const project = await this.getProject(user, projectId);
    const buffer = await this.excel.buildExportBuffer({
      project,
      companyName: project.company.name,
      template,
    });
    const suffix = template ? 'modelo' : `projeto-${project.code}`;
    return {
      buffer,
      filename: `${suffix}.xlsx`,
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  async importProject(
    user: AuthenticatedRequestUser,
    projectId: string,
    buffer: Buffer,
  ) {
    this.assertCanImport(user);
    await this.resolveProjectInScope(user, projectId);
    const result = await this.excel.importFromBuffer({ projectId, buffer });
    const project = await this.getProject(user, projectId);
    return { ...result, project };
  }
}
