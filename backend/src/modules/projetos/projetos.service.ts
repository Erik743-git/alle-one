import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ProjectActivityKind,
  ProjectActivityStatus,
  ProjectBudgetUnit,
  ProjectCompletionApprovalStatus,
  ProjectHistoryEventType,
  ProjectStatus,
  UserRole,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import ExcelJS from 'exceljs';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { ProjetosDocumentsService } from './projetos-documents.service';
import { ProjetosHistoryPdfService } from './projetos-history-pdf.service';
import type {
  CreateProjectActivityDto,
  CreateProjectDto,
  CreateProjectPhaseDto,
  SearchProjetosUsersQueryDto,
  UpdateProjectActivityDto,
  UpdateProjectDto,
} from './projetos.dto';

const HOURS_PER_WORK_DAY = 8;

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

export type ProjectActivityPredecessorDto = {
  id: string;
  wbsCode: string;
  name: string;
  completed: boolean;
};

export type ProjectTicketAppointmentDto = {
  portalAppointmentId: string;
  appointmentDate: string;
  initTime: string;
  endTime: string;
  minutes: number;
  description: string;
  authorName: string;
  serviceName: string;
  attendance: string | null;
  linkedActivityId: string | null;
  linkedActivityLabel: string | null;
  linkId: string | null;
};

export type ProjectActivityAppointmentDto = {
  id: string;
  portalAppointmentId: string;
  appointmentDate: string;
  initTime: string;
  endTime: string;
  description: string;
  authorName: string;
  minutes?: number;
};

export type ProjectActivityDto = {
  id: string;
  projectId: string;
  parentId: string | null;
  wbsCode: string;
  name: string;
  kind: ProjectActivityKind;
  level: number;
  sortOrder: number;
  durationDays: number | null;
  durationHours: number | null;
  startDate: string | null;
  endDate: string | null;
  actualDurationDays: number | null;
  actualDurationHours: number | null;
  progressPercent: number;
  activityStatus: ProjectActivityStatus;
  completedAt: string | null;
  assigneeUserId: string | null;
  assigneeName: string | null;
  assigneeDisplayName: string | null;
  isMilestone: boolean;
  notes: string | null;
  predecessorIds: string[];
  predecessors: ProjectActivityPredecessorDto[];
  predecessorsComplete: boolean;
  canStart: boolean;
  appointments: ProjectActivityAppointmentDto[];
  children: ProjectActivityDto[];
};

export type ProjectHistoryDto = {
  id: string;
  eventType: ProjectHistoryEventType;
  entityType: string | null;
  entityId: string | null;
  summary: string;
  payload: unknown;
  actorUserId: string | null;
  actorName: string | null;
  createdAt: string;
};

export type ProjectSummaryDto = {
  id: string;
  code: number;
  companyId: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  ticketNumber: number | null;
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

type ActivityAppointmentRow = {
  id: string;
  minutes: number;
  portalAppointment: {
    id: string;
    appointmentDate: Date;
    initTime: string;
    endTime: string;
    description: string;
    createdBy: string;
    creator: { name: string };
  };
};

type ActivityRow = {
  id: string;
  projectId: string;
  parentId: string | null;
  wbsCode: string;
  name: string;
  kind: ProjectActivityKind;
  level: number;
  sortOrder: number;
  durationDays: number;
  durationHours: number | null;
  startDate: Date | null;
  endDate: Date | null;
  actualDurationDays: number | null;
  actualDurationHours: number | null;
  progressPercent: number;
  activityStatus: ProjectActivityStatus;
  completedAt: Date | null;
  assigneeUserId: string | null;
  assigneeName: string | null;
  isMilestone: boolean;
  notes: string | null;
  assignee: { name: string } | null;
  predecessors: Array<{ predecessorId: string }>;
  appointments: ActivityAppointmentRow[];
};

@Injectable()
export class ProjetosExcelService {
  constructor(private readonly prisma: PrismaService) {}

  async buildExportBuffer(params: {
    project?: ProjectDetailDto;
    companyName: string;
    template: boolean;
    hideDurations?: boolean;
  }): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Alle One';

    const instructions = workbook.addWorksheet('Instruções');
    instructions.addRow(['Como usar esta planilha']);
    instructions.addRow([
      '1. Preencha a aba Atividades: Tipo (FASE, ATIVIDADE ou MARCO), WBS, WBS pai (fase), nome, duração em horas, datas (AAAA-MM-DD), responsável, % andamento, tempo real (horas) e predecessoras (WBS separadas por ;).',
    ]);
    instructions.addRow([
      '2. Fases não têm WBS pai nem duração. Atividades e marcos devem referenciar o WBS da fase pai.',
    ]);
    instructions.addRow([
      '3. Planilhas antigas com "Duração (dias)" ainda são aceitas na importação (1 dia = 8h).',
    ]);
    instructions.addRow([
      '4. Importação disponível apenas para equipe interna (não cliente).',
    ]);
    instructions.getColumn(1).width = 100;

    const sheet = workbook.addWorksheet('Atividades');
    const headers = params.hideDurations
      ? [
          'WBS',
          'WBS pai',
          'Tipo',
          'Nome da tarefa',
          'Início',
          'Término',
          'Responsável',
          'E-mail responsável',
          '% Andamento',
          'Predecessoras (WBS)',
          'Marco (S/N)',
          'Observações',
        ]
      : [
          'WBS',
          'WBS pai',
          'Tipo',
          'Nome da tarefa',
          'Duração (horas)',
          'Início',
          'Término',
          'Responsável',
          'E-mail responsável',
          '% Andamento',
          'Tempo real (horas)',
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
        const tipo = this.kindExportLabel(row.kind, row.isMilestone);
        const durationHours =
          row.durationHours ??
          (row.durationDays != null
            ? row.durationDays * HOURS_PER_WORK_DAY
            : '');
        const actualHours =
          row.actualDurationHours ??
          (row.actualDurationDays != null
            ? row.actualDurationDays * HOURS_PER_WORK_DAY
            : '');
        sheet.addRow(
          params.hideDurations
            ? [
                row.wbsCode,
                row.parentWbs ?? '',
                tipo,
                row.name,
                row.startDate ?? '',
                row.endDate ?? '',
                row.assigneeDisplayName ?? row.assigneeName ?? '',
                row.assigneeEmail ?? '',
                row.progressPercent,
                row.predecessorWbs.join('; '),
                row.isMilestone ? 'S' : 'N',
                row.notes ?? '',
              ]
            : [
                row.wbsCode,
                row.parentWbs ?? '',
                tipo,
                row.name,
                row.kind === ProjectActivityKind.PHASE ? '' : durationHours,
                row.startDate ?? '',
                row.endDate ?? '',
                row.assigneeDisplayName ?? row.assigneeName ?? '',
                row.assigneeEmail ?? '',
                row.progressPercent,
                row.kind === ProjectActivityKind.PHASE ? '' : actualHours,
                row.predecessorWbs.join('; '),
                row.isMilestone ? 'S' : 'N',
                row.notes ?? '',
              ],
        );
      }

      const summary = workbook.addWorksheet('Resumo');
      summary.addRow(['Empresa', params.companyName]);
      summary.addRow([
        'Projeto',
        `#${params.project.code} — ${params.project.name}`,
      ]);
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
    await workbook.xlsx.load(
      Buffer.from(params.buffer) as unknown as ExcelJS.Buffer,
    );
    const sheet = workbook.getWorksheet('Atividades') ?? workbook.worksheets[0];
    if (!sheet) {
      throw new BadRequestException('Planilha sem aba de atividades.');
    }

    const columns = this.resolveImportColumns(sheet.getRow(1));
    if (columns.wbs == null || columns.name == null) {
      throw new BadRequestException(
        'Cabeçalho inválido. Informe as colunas WBS e Nome da tarefa.',
      );
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
      tipo: string | null;
      name: string;
      durationHours: number;
      startDate: Date | null;
      endDate: Date | null;
      assigneeEmail: string | null;
      assigneeName: string | null;
      progressPercent: number;
      actualDurationHours: number | null;
      predecessorWbs: string[];
      isMilestone: boolean;
      notes: string | null;
    }> = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const wbsCode = this.cellText(row, columns.wbs);
      const name = this.cellText(row, columns.name);
      if (!wbsCode && !name) return;
      if (!wbsCode || !name) {
        return;
      }
      const parentWbsRaw = this.cellText(row, columns.parentWbs);
      const tipoRaw = this.cellText(row, columns.tipo) || null;
      const durationHours = this.parseImportDurationHours(row, columns);
      const startDate = this.parseExcelDate(
        columns.start ? this.cellRaw(row, columns.start) : null,
      );
      const endDate = this.parseExcelDate(
        columns.end ? this.cellRaw(row, columns.end) : null,
      );
      const assigneeName = this.cellText(row, columns.assigneeName) || null;
      const assigneeEmail = this.cellText(row, columns.assigneeEmail) || null;
      const progressPercent = Math.min(
        100,
        Math.max(
          0,
          Math.trunc(
            Number(
              columns.progress ? this.cellRaw(row, columns.progress) : 0,
            ) || 0,
          ),
        ),
      );
      const actualDurationHours = this.parseImportActualHours(row, columns);
      const predecessorWbs = this.cellText(row, columns.predecessors)
        .split(';')
        .map((part) => part.trim())
        .filter(Boolean);
      const isMilestone = ['s', 'sim', 'yes', 'y', '1', 'true'].includes(
        this.cellText(row, columns.milestone).trim().toLowerCase(),
      );
      const notes = this.cellText(row, columns.notes) || null;

      rows.push({
        rowNumber,
        wbsCode,
        parentWbs: parentWbsRaw || null,
        tipo: tipoRaw,
        name,
        durationHours,
        startDate,
        endDate,
        assigneeEmail,
        assigneeName,
        progressPercent,
        actualDurationHours,
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
          const kind = this.resolveImportRowKind(row);
          const isPhase = kind === ProjectActivityKind.PHASE;
          const isMilestone =
            kind === ProjectActivityKind.MILESTONE || row.isMilestone;

          if (isPhase && row.parentWbs) {
            errors.push({
              row: row.rowNumber,
              message: 'Fase não deve ter WBS pai.',
            });
            continue;
          }

          let parentId: string | null = null;
          if (!isPhase) {
            if (!row.parentWbs) {
              errors.push({
                row: row.rowNumber,
                message: 'Informe o WBS pai (fase) da atividade.',
              });
              continue;
            }
            parentId = wbsToId.get(row.parentWbs) ?? null;
            if (!parentId) {
              errors.push({
                row: row.rowNumber,
                message: `WBS pai "${row.parentWbs}" não encontrado.`,
              });
              continue;
            }
            const parent = await tx.projectActivity.findFirst({
              where: { id: parentId, deletedAt: null },
              select: { kind: true },
            });
            if (parent?.kind !== ProjectActivityKind.PHASE) {
              errors.push({
                row: row.rowNumber,
                message: `WBS pai "${row.parentWbs}" deve ser uma fase.`,
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

          const level = isPhase ? 1 : row.wbsCode.split('.').length;
          const durationHours = isPhase
            ? null
            : isMilestone
              ? 0
              : Math.max(1, row.durationHours || 1);
          const durationDays = isPhase
            ? 0
            : isMilestone
              ? 0
              : Math.max(
                  1,
                  Math.ceil((durationHours ?? 8) / HOURS_PER_WORK_DAY),
                );
          const actualDurationHours = isPhase ? null : row.actualDurationHours;
          const actualDurationDays =
            actualDurationHours != null
              ? Math.max(0, Math.ceil(actualDurationHours / HOURS_PER_WORK_DAY))
              : null;
          const activityStatus =
            row.progressPercent >= 100
              ? ProjectActivityStatus.COMPLETED
              : row.progressPercent > 0
                ? ProjectActivityStatus.IN_PROGRESS
                : ProjectActivityStatus.NOT_STARTED;

          const existingId = wbsToId.get(row.wbsCode);
          const data = {
            parentId,
            name: row.name,
            level,
            kind,
            durationDays,
            durationHours,
            startDate: row.startDate,
            endDate: row.endDate,
            actualDurationDays,
            actualDurationHours,
            progressPercent: row.progressPercent,
            activityStatus,
            completedAt:
              activityStatus === ProjectActivityStatus.COMPLETED
                ? new Date()
                : null,
            assigneeUserId,
            assigneeName: assigneeUserId ? null : row.assigneeName,
            isMilestone,
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

  private normalizeHeader(value: string) {
    return value.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
  }

  private cellText(row: ExcelJS.Row, column?: number | null) {
    if (column == null) return '';
    return String(row.getCell(column).text ?? '').trim();
  }

  private cellRaw(row: ExcelJS.Row, column?: number | null) {
    if (column == null) return null;
    return row.getCell(column).value;
  }

  private resolveImportColumns(headerRow: ExcelJS.Row) {
    const map = new Map<string, number>();
    headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
      const key = this.normalizeHeader(String(cell.value ?? ''));
      if (key) map.set(key, col);
    });

    const col = (aliases: string[]) => {
      for (const alias of aliases) {
        const found = map.get(this.normalizeHeader(alias));
        if (found != null) return found;
      }
      return null;
    };

    return {
      wbs: col(['wbs']),
      parentWbs: col(['wbs pai', 'wbs_pai', 'parent wbs']),
      tipo: col(['tipo', 'type', 'kind']),
      name: col(['nome da tarefa', 'nome', 'name', 'tarefa']),
      durationHours: col([
        'duracao (horas)',
        'duração (horas)',
        'duracao horas',
        'duration hours',
      ]),
      duration: col([
        'duracao (dias)',
        'duração (dias)',
        'duracao',
        'duration',
      ]),
      start: col(['inicio', 'início', 'start', 'data inicio']),
      end: col(['termino', 'término', 'fim', 'end', 'data termino']),
      assigneeName: col(['responsavel', 'responsável', 'assignee']),
      assigneeEmail: col([
        'e-mail responsavel',
        'email responsavel',
        'e-mail',
        'email',
      ]),
      progress: col(['% andamento', 'andamento', 'progresso', 'progress']),
      actualHours: col([
        'tempo real (horas)',
        'tempo real horas',
        'actual hours',
      ]),
      actual: col(['tempo real (dias)', 'tempo real', 'actual']),
      predecessors: col([
        'predecessoras (wbs)',
        'predecessoras',
        'predecessors',
      ]),
      milestone: col(['marco (s/n)', 'marco', 'milestone']),
      notes: col(['observacoes', 'observações', 'notes', 'obs']),
    };
  }

  private kindExportLabel(
    kind: ProjectActivityKind,
    isMilestone: boolean,
  ): string {
    if (kind === ProjectActivityKind.PHASE) return 'FASE';
    if (kind === ProjectActivityKind.MILESTONE || isMilestone) return 'MARCO';
    return 'ATIVIDADE';
  }

  private resolveImportRowKind(row: {
    tipo: string | null;
    isMilestone: boolean;
    parentWbs: string | null;
    wbsCode: string;
  }): ProjectActivityKind {
    const normalized = String(row.tipo ?? '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '');
    if (['FASE', 'PHASE'].includes(normalized)) {
      return ProjectActivityKind.PHASE;
    }
    if (['MARCO', 'MILESTONE'].includes(normalized) || row.isMilestone) {
      return ProjectActivityKind.MILESTONE;
    }
    if (['ATIVIDADE', 'TASK', 'TAREFA'].includes(normalized)) {
      return ProjectActivityKind.TASK;
    }
    if (!row.parentWbs && !row.wbsCode.includes('.')) {
      return ProjectActivityKind.PHASE;
    }
    return row.isMilestone
      ? ProjectActivityKind.MILESTONE
      : ProjectActivityKind.TASK;
  }

  private parseImportDurationHours(
    row: ExcelJS.Row,
    columns: ReturnType<ProjetosExcelService['resolveImportColumns']>,
  ): number {
    if (columns.durationHours != null) {
      return Math.max(
        0,
        Math.trunc(Number(this.cellRaw(row, columns.durationHours)) || 0),
      );
    }
    if (columns.duration != null) {
      const days = Math.max(
        0,
        Math.trunc(Number(this.cellRaw(row, columns.duration)) || 0),
      );
      return days > 0 ? days * HOURS_PER_WORK_DAY : 0;
    }
    return 0;
  }

  private parseImportActualHours(
    row: ExcelJS.Row,
    columns: ReturnType<ProjetosExcelService['resolveImportColumns']>,
  ): number | null {
    if (columns.actualHours != null) {
      const raw = this.cellRaw(row, columns.actualHours);
      if (raw == null || raw === '') return null;
      return Math.max(0, Math.trunc(Number(raw) || 0));
    }
    if (columns.actual != null) {
      const raw = this.cellRaw(row, columns.actual);
      if (raw == null || raw === '') return null;
      const days = Math.max(0, Math.trunc(Number(raw) || 0));
      return days * HOURS_PER_WORK_DAY;
    }
    return null;
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
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(text)
      ? `${text}T00:00:00.000Z`
      : text;
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
    private readonly documents: ProjetosDocumentsService,
    private readonly historyPdf: ProjetosHistoryPdfService,
  ) {}

  private assertCanMutate(user: AuthenticatedRequestUser) {
    if (user.role === UserRole.CLIENT) {
      throw new ForbiddenException(
        'Cliente pode apenas visualizar e exportar projetos.',
      );
    }
  }

  private isProjectLocked(status: ProjectStatus) {
    return (
      status === ProjectStatus.COMPLETED || status === ProjectStatus.CANCELED
    );
  }

  private assertProjectEditable(status: ProjectStatus) {
    if (this.isProjectLocked(status)) {
      throw new BadRequestException(
        'Projeto fechado. Somente leitura — solicite reabertura a um administrador.',
      );
    }
  }

  private hoursToDurationDays(hours: number, isMilestone: boolean): number {
    if (isMilestone) return 0;
    if (hours <= 0) return 1;
    return Math.max(1, Math.ceil(hours / HOURS_PER_WORK_DAY));
  }

  private resolveDurationHours(params: {
    durationHours?: number;
    durationDays?: number;
    isMilestone: boolean;
  }): number {
    if (params.isMilestone) return 0;
    if (params.durationHours !== undefined) {
      return Math.max(0, params.durationHours);
    }
    if (params.durationDays !== undefined) {
      return Math.max(0, params.durationDays * HOURS_PER_WORK_DAY);
    }
    return HOURS_PER_WORK_DAY;
  }

  private deriveActivityStatus(
    progressPercent: number,
    _current?: ProjectActivityStatus,
  ): { activityStatus: ProjectActivityStatus; completedAt: Date | null } {
    if (progressPercent >= 100) {
      return {
        activityStatus: ProjectActivityStatus.COMPLETED,
        completedAt: new Date(),
      };
    }
    if (progressPercent > 0) {
      return {
        activityStatus: ProjectActivityStatus.IN_PROGRESS,
        completedAt: null,
      };
    }
    return {
      activityStatus: ProjectActivityStatus.NOT_STARTED,
      completedAt: null,
    };
  }

  private activityWeight(row: ActivityRow): number {
    if (row.kind === ProjectActivityKind.PHASE || row.isMilestone) return 0;
    return Math.max(
      1,
      row.durationHours ?? (row.durationDays * HOURS_PER_WORK_DAY || 1),
    );
  }

  private async logProjectHistory(params: {
    projectId: string;
    eventType: ProjectHistoryEventType;
    summary: string;
    actorUserId?: string;
    entityType?: string;
    entityId?: string;
    payload?: unknown;
  }) {
    await this.prisma.projectHistory.create({
      data: {
        projectId: params.projectId,
        eventType: params.eventType,
        summary: params.summary,
        actorUserId: params.actorUserId ?? null,
        entityType: params.entityType ?? null,
        entityId: params.entityId ?? null,
        payload:
          params.payload === undefined ? undefined : (params.payload as object),
      },
    });
  }

  private isActivityCompleted(
    row: Pick<ActivityRow, 'activityStatus' | 'progressPercent'>,
  ) {
    return (
      row.activityStatus === ProjectActivityStatus.COMPLETED ||
      row.progressPercent >= 100
    );
  }

  private async syncPhaseFromChildren(phaseId: string) {
    const phase = await this.prisma.projectActivity.findFirst({
      where: { id: phaseId, deletedAt: null, kind: ProjectActivityKind.PHASE },
    });
    if (!phase) return;

    const children = await this.prisma.projectActivity.findMany({
      where: {
        parentId: phaseId,
        deletedAt: null,
        kind: { in: [ProjectActivityKind.TASK, ProjectActivityKind.MILESTONE] },
      },
    });

    if (!children.length) {
      await this.prisma.projectActivity.update({
        where: { id: phaseId },
        data: {
          progressPercent: 0,
          activityStatus: ProjectActivityStatus.NOT_STARTED,
          completedAt: null,
          startDate: null,
          endDate: null,
        },
      });
      return;
    }

    const allCompleted = children.every((child) =>
      this.isActivityCompleted(child),
    );
    const anyStarted = children.some(
      (child) =>
        child.progressPercent > 0 ||
        child.activityStatus === ProjectActivityStatus.IN_PROGRESS ||
        child.activityStatus === ProjectActivityStatus.COMPLETED,
    );
    const totalWeight = children.reduce(
      (sum, child) =>
        sum +
        (child.kind === ProjectActivityKind.MILESTONE
          ? 1
          : Math.max(
              1,
              child.durationHours ??
                (child.durationDays * HOURS_PER_WORK_DAY || 1),
            )),
      0,
    );
    const progressPercent = totalWeight
      ? Math.min(
          100,
          Math.round(
            children.reduce(
              (sum, child) =>
                sum +
                child.progressPercent *
                  (child.kind === ProjectActivityKind.MILESTONE
                    ? 1
                    : Math.max(
                        1,
                        child.durationHours ??
                          (child.durationDays * HOURS_PER_WORK_DAY || 1),
                      )),
              0,
            ) / totalWeight,
          ),
        )
      : Math.round(
          children.reduce((sum, child) => sum + child.progressPercent, 0) /
            children.length,
        );

    const startDates = children
      .map((child) => child.startDate)
      .filter(Boolean) as Date[];
    const endDates = children
      .map((child) => child.endDate)
      .filter(Boolean) as Date[];

    await this.prisma.projectActivity.update({
      where: { id: phaseId },
      data: {
        progressPercent,
        activityStatus: allCompleted
          ? ProjectActivityStatus.COMPLETED
          : anyStarted
            ? ProjectActivityStatus.IN_PROGRESS
            : ProjectActivityStatus.NOT_STARTED,
        completedAt: allCompleted ? new Date() : null,
        startDate: startDates.length
          ? new Date(Math.min(...startDates.map((d) => d.getTime())))
          : null,
        endDate: endDates.length
          ? new Date(Math.max(...endDates.map((d) => d.getTime())))
          : null,
      },
    });
  }

  private async syncPhaseChain(parentId: string | null) {
    if (!parentId) return;
    await this.syncPhaseFromChildren(parentId);
  }

  private async assertPredecessorsCompleted(predecessorIds: string[]) {
    const unique = [...new Set(predecessorIds.filter(Boolean))];
    if (!unique.length) return;

    const rows = await this.prisma.projectActivity.findMany({
      where: { id: { in: unique }, deletedAt: null },
      select: {
        id: true,
        name: true,
        activityStatus: true,
        progressPercent: true,
        kind: true,
      },
    });
    const blocked = rows.filter(
      (row) =>
        row.kind !== ProjectActivityKind.PHASE &&
        !this.isActivityCompleted(row),
    );
    if (blocked.length) {
      const names = blocked.map((row) => row.name).join(', ');
      throw new BadRequestException(
        `Conclua as predecessoras antes de iniciar: ${names}.`,
      );
    }
  }

  private assertCanImport(user: AuthenticatedRequestUser) {
    if (user.role === UserRole.CLIENT) {
      throw new ForbiddenException(
        'Cliente não pode importar planilhas de projetos.',
      );
    }
  }

  private assertAdmin(user: AuthenticatedRequestUser) {
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Apenas administradores podem executar esta ação.',
      );
    }
  }

  private isClientView(user: AuthenticatedRequestUser) {
    return user.role === UserRole.CLIENT;
  }

  private appointmentMinutesFromStrings(
    initTime: string | null,
    endTime: string | null,
  ): number {
    const parse = (value: string | null) => {
      if (!value) return null;
      const [h, m] = value.split(':').map((part) => Number(part));
      if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
      return h * 60 + m;
    };
    const start = parse(initTime);
    const end = parse(endTime);
    if (start == null || end == null) return 0;
    return Math.max(0, end - start);
  }

  private minutesToDays(minutes: number): number {
    if (minutes <= 0) return 0;
    return Math.max(1, Math.round(minutes / (HOURS_PER_WORK_DAY * 60)));
  }

  private stripAppointmentDescription(value: string): string {
    return value
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private maskBudgetForClient(budget: ProjectBudgetDto): ProjectBudgetDto {
    return {
      ...budget,
      consumedDays: 0,
      consumedHours: 0,
      consumedInUnit: null,
      exceeded: false,
    };
  }

  private async assertTicketLinkable(
    companyId: string,
    ticketNumber: number,
    excludeProjectId?: string,
  ) {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, deletedAt: null },
      select: { tifluxClientId: true },
    });
    if (!company) {
      throw new NotFoundException('Empresa não encontrada.');
    }

    let ticket: {
      ticket_number: number;
      client_external_id: number | null;
    } | null = null;

    const portal = await this.prisma.portalTicket.findUnique({
      where: { ticketNumber },
      select: { ticketNumber: true, clientExternalId: true },
    });
    if (portal) {
      ticket = {
        ticket_number: portal.ticketNumber,
        client_external_id: portal.clientExternalId,
      };
    } else {
      try {
        const rows =
          (await this.prisma.$queryRaw<
            Array<{
              ticket_number: number;
              client_external_id: number | null;
            }>
          >`
            SELECT t.ticket_number, t.client_external_id
            FROM tiflux.tickets t
            WHERE t.ticket_number = ${ticketNumber}
            LIMIT 1
          `) ?? [];
        ticket = rows[0] ?? null;
      } catch {
        ticket = null;
      }
    }

    if (!ticket) {
      throw new BadRequestException(`Ticket #${ticketNumber} não encontrado.`);
    }

    if (
      company.tifluxClientId != null &&
      ticket.client_external_id != null &&
      company.tifluxClientId !== ticket.client_external_id
    ) {
      throw new BadRequestException(
        'O ticket informado não pertence à empresa do projeto.',
      );
    }

    const existing = await this.prisma.project.findFirst({
      where: {
        ticketNumber,
        deletedAt: null,
        ...(excludeProjectId ? { NOT: { id: excludeProjectId } } : {}),
      },
      select: { id: true, code: true },
    });
    if (existing) {
      throw new BadRequestException(
        `O ticket #${ticketNumber} já está vinculado ao projeto #${existing.code}.`,
      );
    }
  }

  async listActivitiesForTicket(ticketNumber: number) {
    const project = await this.prisma.project.findFirst({
      where: { ticketNumber, deletedAt: null },
      select: { id: true, code: true, name: true },
    });
    if (!project) return null;

    const activities = await this.prisma.projectActivity.findMany({
      where: {
        projectId: project.id,
        deletedAt: null,
        kind: { in: [ProjectActivityKind.TASK, ProjectActivityKind.MILESTONE] },
      },
      select: { id: true, wbsCode: true, name: true, parentId: true },
      orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }, { wbsCode: 'asc' }],
    });

    return {
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
      },
      activities: activities.map((row) => ({
        id: row.id,
        wbsCode: row.wbsCode,
        name: row.name,
        label: `${row.wbsCode} — ${row.name}`,
      })),
    };
  }

  async linkPortalAppointmentToActivity(params: {
    ticketNumber: number;
    projectActivityId: string;
    portalAppointmentId: string;
    initTime: string;
    endTime: string;
    createdBy: string;
  }) {
    const existing = await this.prisma.projectActivityAppointment.findUnique({
      where: { portalAppointmentId: params.portalAppointmentId },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException(
        'Este apontamento já está vinculado a uma atividade.',
      );
    }

    const activity = await this.prisma.projectActivity.findFirst({
      where: { id: params.projectActivityId, deletedAt: null },
      include: {
        project: {
          select: {
            id: true,
            ticketNumber: true,
            deletedAt: true,
            status: true,
          },
        },
      },
    });
    if (!activity?.project || activity.project.deletedAt) {
      throw new BadRequestException('Atividade do projeto inválida.');
    }
    if (activity.kind === ProjectActivityKind.PHASE) {
      throw new BadRequestException(
        'Apontamentos vinculam-se a atividades, não a fases.',
      );
    }
    if (activity.project.ticketNumber !== params.ticketNumber) {
      throw new BadRequestException(
        'A atividade não pertence ao projeto vinculado a este ticket.',
      );
    }

    const portal = await this.prisma.portalTicketAppointment.findFirst({
      where: {
        id: params.portalAppointmentId,
        ticketNumber: params.ticketNumber,
      },
      select: { id: true },
    });
    if (!portal) {
      throw new BadRequestException('Apontamento do ticket não encontrado.');
    }

    const minutes = this.appointmentMinutesFromStrings(
      params.initTime,
      params.endTime,
    );
    if (minutes <= 0) {
      throw new BadRequestException('Horário do apontamento inválido.');
    }

    await this.prisma.projectActivityAppointment.create({
      data: {
        activityId: activity.id,
        portalAppointmentId: params.portalAppointmentId,
        minutes,
      },
    });

    await this.recalculateActivityFromAppointments(
      activity.id,
      params.createdBy,
    );

    await this.logProjectHistory({
      projectId: activity.projectId,
      eventType: ProjectHistoryEventType.APPOINTMENT_LINKED,
      summary: `Apontamento vinculado à atividade ${activity.wbsCode} — ${activity.name}`,
      actorUserId: params.createdBy,
      entityType: 'TASK',
      entityId: activity.id,
      payload: { portalAppointmentId: params.portalAppointmentId, minutes },
    });
  }

  async listProjectTicketAppointments(
    user: AuthenticatedRequestUser,
    projectId: string,
  ): Promise<{
    ticketNumber: number | null;
    appointments: ProjectTicketAppointmentDto[];
  }> {
    const project = await this.resolveProjectInScope(user, projectId);
    if (!project.ticketNumber) {
      return { ticketNumber: null, appointments: [] };
    }

    const [portalRows, links] = await Promise.all([
      this.prisma.portalTicketAppointment.findMany({
        where: { ticketNumber: project.ticketNumber },
        include: { creator: { select: { name: true } } },
        orderBy: [{ appointmentDate: 'desc' }, { initTime: 'desc' }],
      }),
      this.prisma.projectActivityAppointment.findMany({
        where: { activity: { projectId, deletedAt: null } },
        include: {
          activity: { select: { id: true, wbsCode: true, name: true } },
        },
      }),
    ]);

    const linkByPortal = new Map(
      links.map((row) => [row.portalAppointmentId, row]),
    );

    return {
      ticketNumber: project.ticketNumber,
      appointments: portalRows.map((row) => {
        const link = linkByPortal.get(row.id);
        const minutes = this.appointmentMinutesFromStrings(
          row.initTime,
          row.endTime,
        );
        return {
          portalAppointmentId: row.id,
          appointmentDate: this.formatDateOnly(row.appointmentDate) ?? '',
          initTime: row.initTime,
          endTime: row.endTime,
          minutes,
          description: this.stripAppointmentDescription(row.description),
          authorName: row.creator.name,
          serviceName: row.serviceName,
          attendance: row.attendance,
          linkedActivityId: link?.activityId ?? null,
          linkedActivityLabel: link
            ? `${link.activity.wbsCode} — ${link.activity.name}`
            : null,
          linkId: link?.id ?? null,
        };
      }),
    };
  }

  async linkActivityAppointment(
    user: AuthenticatedRequestUser,
    activityId: string,
    portalAppointmentId: string,
  ) {
    this.assertCanMutate(user);
    const activity = await this.prisma.projectActivity.findFirst({
      where: { id: activityId, deletedAt: null },
      include: { project: true },
    });
    if (!activity) {
      throw new NotFoundException('Atividade não encontrada.');
    }
    await this.resolveProjectInScope(user, activity.projectId);
    this.assertProjectEditable(activity.project.status);
    if (!activity.project.ticketNumber) {
      throw new BadRequestException('Projeto sem ticket vinculado.');
    }

    const portal = await this.prisma.portalTicketAppointment.findFirst({
      where: { id: portalAppointmentId },
      select: { initTime: true, endTime: true, ticketNumber: true },
    });
    if (!portal || portal.ticketNumber !== activity.project.ticketNumber) {
      throw new BadRequestException('Apontamento inválido para este projeto.');
    }

    await this.linkPortalAppointmentToActivity({
      ticketNumber: activity.project.ticketNumber,
      projectActivityId: activityId,
      portalAppointmentId,
      initTime: portal.initTime,
      endTime: portal.endTime,
      createdBy: user.userId,
    });

    if (activity.parentId) {
      await this.syncPhaseChain(activity.parentId);
    }

    return this.getProject(user, activity.projectId);
  }

  async unlinkActivityAppointment(
    user: AuthenticatedRequestUser,
    linkId: string,
  ) {
    this.assertCanMutate(user);
    const link = await this.prisma.projectActivityAppointment.findUnique({
      where: { id: linkId },
      include: {
        activity: {
          include: { project: true },
        },
      },
    });
    if (!link?.activity || link.activity.deletedAt) {
      throw new NotFoundException('Vínculo não encontrado.');
    }
    await this.resolveProjectInScope(user, link.activity.projectId);
    this.assertProjectEditable(link.activity.project.status);

    await this.prisma.projectActivityAppointment.delete({
      where: { id: linkId },
    });
    await this.recalculateActivityFromAppointments(link.activityId);

    await this.logProjectHistory({
      projectId: link.activity.projectId,
      eventType: ProjectHistoryEventType.APPOINTMENT_LINKED,
      summary: `Apontamento desvinculado da atividade ${link.activity.wbsCode} — ${link.activity.name}`,
      actorUserId: user.userId,
      entityType: link.activity.kind,
      entityId: link.activityId,
      payload: {
        portalAppointmentId: link.portalAppointmentId,
        action: 'UNLINK',
      },
    });

    if (link.activity.parentId) {
      await this.syncPhaseChain(link.activity.parentId);
    }

    return this.getProject(user, link.activity.projectId);
  }

  async refreshPortalAppointmentLink(
    portalAppointmentId: string,
    initTime: string,
    endTime: string,
  ) {
    const link = await this.prisma.projectActivityAppointment.findUnique({
      where: { portalAppointmentId },
      select: { id: true, activityId: true },
    });
    if (!link) return;

    const minutes = this.appointmentMinutesFromStrings(initTime, endTime);
    await this.prisma.projectActivityAppointment.update({
      where: { id: link.id },
      data: { minutes },
    });
    await this.recalculateActivityFromAppointments(link.activityId);
  }

  async handlePortalAppointmentDeleted(portalAppointmentId: string) {
    const link = await this.prisma.projectActivityAppointment.findUnique({
      where: { portalAppointmentId },
      select: { id: true, activityId: true },
    });
    if (!link) return;
    await this.prisma.projectActivityAppointment.delete({
      where: { id: link.id },
    });
    await this.recalculateActivityFromAppointments(link.activityId);
  }

  private async recalculateActivityFromAppointments(
    activityId: string,
    latestAssigneeUserId?: string,
  ) {
    const activity = await this.prisma.projectActivity.findFirst({
      where: { id: activityId, deletedAt: null },
      include: {
        appointments: {
          include: {
            portalAppointment: {
              select: { createdBy: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        assignee: { select: { name: true } },
      },
    });
    if (!activity) return;

    const totalMinutes = activity.appointments.reduce(
      (sum, row) => sum + row.minutes,
      0,
    );
    const actualDurationHours =
      totalMinutes > 0 ? Math.max(1, Math.round(totalMinutes / 60)) : null;
    const actualDurationDays =
      totalMinutes > 0 ? this.minutesToDays(totalMinutes) : null;
    const latestCreator =
      activity.appointments.at(-1)?.portalAppointment.createdBy ??
      latestAssigneeUserId ??
      activity.assigneeUserId;

    const plannedHours =
      activity.durationHours ??
      (activity.durationDays > 0
        ? activity.durationDays * HOURS_PER_WORK_DAY
        : 0);

    let progressPercent = activity.progressPercent;
    if (plannedHours > 0 && totalMinutes > 0) {
      progressPercent = Math.min(
        100,
        Math.round((totalMinutes / (plannedHours * 60)) * 100),
      );
    } else if (totalMinutes > 0 && activity.isMilestone) {
      progressPercent = 100;
    } else if (totalMinutes === 0 && activity.appointments.length === 0) {
      progressPercent = 0;
    }

    const statusDerived = this.deriveActivityStatus(progressPercent);

    const assigneeUser = latestCreator
      ? await this.prisma.user.findFirst({
          where: { id: latestCreator },
          select: { id: true, name: true },
        })
      : null;

    await this.prisma.projectActivity.update({
      where: { id: activityId },
      data: {
        actualDurationDays,
        actualDurationHours,
        progressPercent,
        activityStatus: statusDerived.activityStatus,
        completedAt: statusDerived.completedAt,
        assigneeUserId: assigneeUser?.id ?? null,
        assigneeName: assigneeUser?.name ?? activity.assigneeName,
      },
    });

    if (activity.parentId) {
      await this.syncPhaseFromChildren(activity.parentId);
    }
  }

  private activityConsumedDays(row: ActivityRow): number {
    if (row.isMilestone) return 0;
    if (row.appointments.length > 0) {
      const totalMinutes = row.appointments.reduce(
        (sum, item) => sum + item.minutes,
        0,
      );
      return totalMinutes / (HOURS_PER_WORK_DAY * 60);
    }
    return (
      row.actualDurationDays ??
      (row.progressPercent >= 100 ? row.durationDays : 0)
    );
  }

  private mapAppointmentRow(
    row: ActivityAppointmentRow,
    hideDurations: boolean,
  ): ProjectActivityAppointmentDto {
    const mapped: ProjectActivityAppointmentDto = {
      id: row.id,
      portalAppointmentId: row.portalAppointment.id,
      appointmentDate: row.portalAppointment.appointmentDate
        .toISOString()
        .slice(0, 10),
      initTime: row.portalAppointment.initTime,
      endTime: row.portalAppointment.endTime,
      description: this.stripAppointmentDescription(
        row.portalAppointment.description,
      ),
      authorName: row.portalAppointment.creator.name,
    };
    if (!hideDurations) {
      mapped.minutes = row.minutes;
    }
    return mapped;
  }

  private computeBudgetMetrics(activities: ActivityRow[]) {
    let consumedDays = 0;
    for (const row of activities) {
      consumedDays += Math.max(0, this.activityConsumedDays(row));
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
      unitLabel:
        project.budgetUnit === ProjectBudgetUnit.HOURS ? 'horas' : 'dias',
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

  private async loadProjectDocuments(
    projectId: string,
  ): Promise<ProjectDocumentDto[]> {
    return this.documents.list(projectId);
  }

  private async saveProjectDocuments(
    user: AuthenticatedRequestUser,
    projectId: string,
    files: Express.Multer.File[],
  ) {
    await this.documents.save(user, projectId, files);
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
        project.completionApprovalStatus ===
        ProjectCompletionApprovalStatus.PENDING
      ) {
        await this.prisma.project.update({
          where: { id: project.id },
          data: {
            completionApprovalStatus:
              ProjectCompletionApprovalStatus.NOT_REQUIRED,
          },
        });
      }
      return;
    }

    if (
      project.completionApprovalStatus !==
      ProjectCompletionApprovalStatus.APPROVED
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

  async getAccessibleCompanyIds(
    user: AuthenticatedRequestUser,
  ): Promise<string[]> {
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
      (a) =>
        a.kind !== ProjectActivityKind.PHASE &&
        !activities.some((child) => child.parentId === a.id),
    );
    const pool = leaves.length
      ? leaves
      : activities.filter((a) => a.kind !== ProjectActivityKind.PHASE);
    if (!pool.length) return 0;
    const totalWeight = pool.reduce(
      (sum, row) => sum + this.activityWeight(row),
      0,
    );
    if (!totalWeight) {
      return Math.round(
        pool.reduce((sum, row) => sum + row.progressPercent, 0) / pool.length,
      );
    }
    const weighted = pool.reduce(
      (sum, row) => sum + row.progressPercent * this.activityWeight(row),
      0,
    );
    return Math.min(100, Math.round(weighted / totalWeight));
  }

  private mapActivityRow(
    row: ActivityRow,
    hideDurations: boolean,
    byId: Map<string, ActivityRow>,
  ): Omit<ProjectActivityDto, 'children'> {
    const predecessors = row.predecessors.map((p) => {
      const pred = byId.get(p.predecessorId);
      const completed = pred != null && this.isActivityCompleted(pred);
      return {
        id: p.predecessorId,
        wbsCode: pred?.wbsCode ?? '',
        name: pred?.name ?? 'Removida',
        completed,
      };
    });
    const predecessorsComplete =
      predecessors.length === 0 || predecessors.every((p) => p.completed);

    return {
      id: row.id,
      projectId: row.projectId,
      parentId: row.parentId,
      wbsCode: row.wbsCode,
      name: row.name,
      kind: row.kind,
      level: row.level,
      sortOrder: row.sortOrder,
      durationDays: hideDurations ? null : row.durationDays,
      durationHours: hideDurations ? null : row.durationHours,
      startDate: this.formatDateOnly(row.startDate),
      endDate: this.formatDateOnly(row.endDate),
      actualDurationDays: hideDurations ? null : row.actualDurationDays,
      actualDurationHours: hideDurations ? null : row.actualDurationHours,
      progressPercent: row.progressPercent,
      activityStatus: row.activityStatus,
      completedAt: row.completedAt?.toISOString() ?? null,
      assigneeUserId: row.assigneeUserId,
      assigneeName: row.assigneeName,
      assigneeDisplayName: row.assignee?.name ?? row.assigneeName,
      isMilestone: row.isMilestone,
      notes: row.notes,
      predecessorIds: row.predecessors.map((p) => p.predecessorId),
      predecessors,
      predecessorsComplete,
      canStart: predecessorsComplete,
      appointments: row.appointments.map((item) =>
        this.mapAppointmentRow(item, hideDurations),
      ),
    };
  }

  private buildActivityTree(
    rows: ActivityRow[],
    hideDurations: boolean,
  ): ProjectActivityDto[] {
    const byId = new Map(rows.map((row) => [row.id, row]));
    const mapped = rows.map((row) => ({
      ...this.mapActivityRow(row, hideDurations, byId),
      children: [] as ProjectActivityDto[],
    }));
    const mappedById = new Map(mapped.map((row) => [row.id, row]));
    const roots: ProjectActivityDto[] = [];
    for (const row of mapped) {
      if (row.parentId && mappedById.has(row.parentId)) {
        mappedById.get(row.parentId)!.children.push(row);
      } else {
        roots.push(row);
      }
    }
    const sortRec = (nodes: ProjectActivityDto[]) => {
      nodes.sort(
        (a, b) =>
          a.sortOrder - b.sortOrder || a.wbsCode.localeCompare(b.wbsCode),
      );
      nodes.forEach((node) => sortRec(node.children));
    };
    sortRec(roots);
    return roots;
  }

  private async loadProjectActivities(
    projectId: string,
  ): Promise<ActivityRow[]> {
    return this.prisma.projectActivity.findMany({
      where: { projectId, deletedAt: null },
      orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }, { wbsCode: 'asc' }],
      include: {
        assignee: { select: { name: true } },
        predecessors: { select: { predecessorId: true } },
        appointments: {
          orderBy: { createdAt: 'asc' },
          include: {
            portalAppointment: {
              select: {
                id: true,
                appointmentDate: true,
                initTime: true,
                endTime: true,
                description: true,
                createdBy: true,
                creator: { select: { name: true } },
              },
            },
          },
        },
      },
    });
  }

  private buildProjectSummary(
    project: {
      id: string;
      code: number;
      companyId: string;
      name: string;
      description: string | null;
      status: ProjectStatus;
      ticketNumber: number | null;
      startDate: Date | null;
      endDate: Date | null;
      budgetUnit: ProjectBudgetUnit | null;
      budgetAmount: number | null;
      completionApprovalStatus: ProjectCompletionApprovalStatus;
      completionApprovalNote: string | null;
      completionApprovedAt: Date | null;
      completionApprover?: { name: string } | null;
      createdAt: Date;
      updatedAt: Date;
    },
    activities: ActivityRow[],
    documentsCount: number,
    hideDurations: boolean,
  ): ProjectSummaryDto {
    const budget = this.buildBudgetDto(project, activities);
    return {
      id: project.id,
      code: project.code,
      companyId: project.companyId,
      name: project.name,
      description: project.description,
      status: project.status,
      ticketNumber: project.ticketNumber,
      startDate: this.formatDateOnly(project.startDate),
      endDate: this.formatDateOnly(project.endDate),
      progressPercent: this.computeProgress(activities),
      activitiesCount: activities.length,
      budget: hideDurations ? this.maskBudgetForClient(budget) : budget,
      completionApproval: this.buildCompletionApprovalDto(project),
      documentsCount,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    };
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
    const hideDurations = this.isClientView(user);
    for (const project of projects) {
      const activities = await this.loadProjectActivities(project.id);
      const documentsCount = await this.prisma.projectDocument.count({
        where: { projectId: project.id },
      });
      summaries.push(
        this.buildProjectSummary(
          project,
          activities,
          documentsCount,
          hideDurations,
        ),
      );
    }

    return { company, projects: summaries };
  }

  async getProject(
    user: AuthenticatedRequestUser,
    projectId: string,
  ): Promise<ProjectDetailDto> {
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
    const hideDurations = this.isClientView(user);
    return {
      ...this.buildProjectSummary(
        full,
        activities,
        documents.length,
        hideDurations,
      ),
      company: full.company,
      activities: this.buildActivityTree(activities, hideDurations),
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
    await this.assertTicketLinkable(companyId, body.ticketNumber);

    const project = await this.prisma.project.create({
      data: {
        companyId,
        name: body.name.trim(),
        description: body.description?.trim() || null,
        status:
          (body.status as ProjectStatus | undefined) ?? ProjectStatus.PLANNING,
        startDate: body.startDate
          ? new Date(`${body.startDate}T00:00:00.000Z`)
          : null,
        endDate: body.endDate
          ? new Date(`${body.endDate}T00:00:00.000Z`)
          : null,
        budgetUnit: body.budgetUnit as ProjectBudgetUnit,
        budgetAmount: body.budgetAmount,
        ticketNumber: body.ticketNumber,
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
    return this.documents.download(projectId, documentId);
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
      project.completionApprovalStatus !==
      ProjectCompletionApprovalStatus.PENDING
    ) {
      throw new BadRequestException(
        'Este projeto não possui aprovação pendente.',
      );
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
    this.assertProjectEditable(project.status);
    const activities = await this.loadProjectActivities(projectId);

    if (body.status === ProjectStatus.COMPLETED) {
      await this.assertCanCompleteProject(project, activities);
    }

    if (body.ticketNumber !== undefined) {
      await this.assertTicketLinkable(
        project.companyId,
        body.ticketNumber,
        projectId,
      );
    }

    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.description !== undefined
          ? { description: body.description?.trim() || null }
          : {}),
        ...(body.status !== undefined
          ? { status: body.status as ProjectStatus }
          : {}),
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
        ...(body.ticketNumber !== undefined
          ? { ticketNumber: body.ticketNumber }
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
      throw new BadRequestException(
        'Atividade não pode ser predecessora de si mesma.',
      );
    }
    if (!unique.length) return;

    const rows = await this.prisma.projectActivity.findMany({
      where: {
        projectId: params.projectId,
        id: { in: unique },
        deletedAt: null,
      },
      select: { id: true, parentId: true, kind: true },
    });
    if (rows.length !== unique.length) {
      throw new BadRequestException('Predecessora inválida para este projeto.');
    }
    if (rows.some((row) => row.kind === ProjectActivityKind.PHASE)) {
      throw new BadRequestException('Fases não podem ser predecessoras.');
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
      adj.set(params.activityId, [
        ...(adj.get(params.activityId) ?? []),
        predId,
      ]);
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
      throw new BadRequestException(
        'Dependência circular entre predecessoras.',
      );
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

  async createPhase(
    user: AuthenticatedRequestUser,
    projectId: string,
    body: CreateProjectPhaseDto,
  ) {
    this.assertCanMutate(user);
    const project = await this.resolveProjectInScope(user, projectId);
    this.assertProjectEditable(project.status);

    const wbsCode = await this.nextWbsCode(projectId, null);
    const maxSort = await this.prisma.projectActivity.aggregate({
      where: { projectId, parentId: null, deletedAt: null },
      _max: { sortOrder: true },
    });

    const phase = await this.prisma.projectActivity.create({
      data: {
        projectId,
        parentId: null,
        wbsCode,
        name: body.name.trim(),
        kind: ProjectActivityKind.PHASE,
        level: 1,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
        durationDays: 0,
        durationHours: null,
        progressPercent: 0,
        activityStatus: ProjectActivityStatus.NOT_STARTED,
        notes: body.notes?.trim() || null,
      },
    });

    await this.logProjectHistory({
      projectId,
      eventType: ProjectHistoryEventType.PHASE_CREATED,
      summary: `Fase criada: ${phase.name}`,
      actorUserId: user.userId,
      entityType: 'PHASE',
      entityId: phase.id,
    });

    return this.getProject(user, projectId);
  }

  async getProjectHistory(user: AuthenticatedRequestUser, projectId: string) {
    await this.resolveProjectInScope(user, projectId);
    const rows = await this.prisma.projectHistory.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { name: true } } },
    });
    return rows.map(
      (row): ProjectHistoryDto => ({
        id: row.id,
        eventType: row.eventType,
        entityType: row.entityType,
        entityId: row.entityId,
        summary: row.summary,
        payload: row.payload,
        actorUserId: row.actorUserId,
        actorName: row.actor?.name ?? null,
        createdAt: row.createdAt.toISOString(),
      }),
    );
  }

  async exportProjectHistoryPdf(
    user: AuthenticatedRequestUser,
    projectId: string,
  ) {
    const project = await this.getProject(user, projectId);
    const events = await this.getProjectHistory(user, projectId);
    return this.historyPdf.build({
      projectCode: project.code,
      projectName: project.name,
      companyName: project.company.name,
      events,
    });
  }

  async reopenProject(user: AuthenticatedRequestUser, projectId: string) {
    this.assertAdmin(user);
    const project = await this.resolveProjectInScope(user, projectId);
    if (!this.isProjectLocked(project.status)) {
      throw new BadRequestException('Projeto não está fechado.');
    }

    await this.prisma.project.update({
      where: { id: projectId },
      data: { status: ProjectStatus.IN_PROGRESS },
    });

    await this.logProjectHistory({
      projectId,
      eventType: ProjectHistoryEventType.PROJECT_REOPENED,
      summary: 'Projeto reaberto',
      actorUserId: user.userId,
    });

    return this.getProject(user, projectId);
  }

  async createActivity(
    user: AuthenticatedRequestUser,
    projectId: string,
    body: CreateProjectActivityDto,
  ) {
    this.assertCanMutate(user);
    const project = await this.resolveProjectInScope(user, projectId);
    this.assertProjectEditable(project.status);

    const parentId = body.parentId;
    const parent = await this.prisma.projectActivity.findFirst({
      where: { id: parentId, projectId, deletedAt: null },
    });
    if (!parent) {
      throw new BadRequestException('Fase inválida.');
    }
    if (parent.kind !== ProjectActivityKind.PHASE) {
      throw new BadRequestException(
        'Atividades devem pertencer a uma fase. Use "Adicionar fase" para criar fases.',
      );
    }

    let predecessorIds = [...(body.predecessorIds ?? [])];
    if (!predecessorIds.length) {
      const previous = await this.prisma.projectActivity.findFirst({
        where: {
          projectId,
          parentId,
          deletedAt: null,
          kind: {
            in: [ProjectActivityKind.TASK, ProjectActivityKind.MILESTONE],
          },
        },
        orderBy: [{ sortOrder: 'desc' }, { wbsCode: 'desc' }],
      });
      if (previous) {
        predecessorIds = [previous.id];
      }
    }

    await this.validatePredecessors({
      projectId,
      predecessorIds,
      parentId,
    });

    const wbsCode = await this.nextWbsCode(projectId, parentId);
    const level = wbsCode.split('.').length;
    const isMilestone = Boolean(body.isMilestone);
    const kind = isMilestone
      ? ProjectActivityKind.MILESTONE
      : ProjectActivityKind.TASK;
    const durationHours = this.resolveDurationHours({
      durationHours: body.durationHours,
      durationDays: body.durationDays,
      isMilestone,
    });
    const durationDays = this.hoursToDurationDays(durationHours, isMilestone);
    const dates = this.resolveDates({
      startDate: body.startDate,
      endDate: body.endDate,
      durationDays,
      isMilestone,
    });
    const progressPercent = body.progressPercent ?? 0;
    const statusDerived = this.deriveActivityStatus(progressPercent);

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
        kind,
        level,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
        durationDays: dates.durationDays,
        durationHours: isMilestone ? 0 : durationHours,
        startDate: dates.startDate,
        endDate: dates.endDate,
        actualDurationDays: body.actualDurationDays ?? null,
        actualDurationHours:
          body.actualDurationHours ??
          (body.actualDurationDays != null
            ? body.actualDurationDays * HOURS_PER_WORK_DAY
            : null),
        progressPercent,
        activityStatus: statusDerived.activityStatus,
        completedAt: statusDerived.completedAt,
        assigneeUserId: body.assigneeUserId ?? null,
        assigneeName: body.assigneeUserId
          ? null
          : body.assigneeName?.trim() || null,
        isMilestone,
        notes: body.notes?.trim() || null,
      },
    });

    for (const predecessorId of predecessorIds) {
      await this.prisma.projectActivityPredecessor.create({
        data: { activityId: activity.id, predecessorId },
      });
    }

    await this.logProjectHistory({
      projectId,
      eventType: isMilestone
        ? ProjectHistoryEventType.TASK_CREATED
        : ProjectHistoryEventType.TASK_CREATED,
      summary: `${isMilestone ? 'Marco' : 'Atividade'} criada: ${activity.name}`,
      actorUserId: user.userId,
      entityType: kind,
      entityId: activity.id,
    });

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

    await this.syncPhaseChain(parentId);

    return this.getProject(user, projectId);
  }

  async completeActivity(
    user: AuthenticatedRequestUser,
    activityId: string,
    completed: boolean,
  ) {
    return this.updateActivity(user, activityId, {
      progressPercent: completed ? 100 : 0,
    });
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
    this.assertProjectEditable(current.project.status);

    if (current.kind === ProjectActivityKind.PHASE) {
      await this.prisma.projectActivity.update({
        where: { id: activityId },
        data: {
          ...(body.name !== undefined ? { name: body.name.trim() } : {}),
          ...(body.notes !== undefined
            ? { notes: body.notes?.trim() || null }
            : {}),
        },
      });
      await this.logProjectHistory({
        projectId: current.projectId,
        eventType: ProjectHistoryEventType.PHASE_UPDATED,
        summary: `Fase atualizada: ${body.name?.trim() ?? current.name}`,
        actorUserId: user.userId,
        entityType: 'PHASE',
        entityId: activityId,
      });
      return this.getProject(user, current.projectId);
    }

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
    const kind = isMilestone
      ? ProjectActivityKind.MILESTONE
      : ProjectActivityKind.TASK;
    const durationHours =
      body.durationHours !== undefined
        ? Math.max(0, body.durationHours)
        : body.durationDays !== undefined
          ? body.durationDays * HOURS_PER_WORK_DAY
          : (current.durationHours ??
            current.durationDays * HOURS_PER_WORK_DAY);
    const durationDays =
      body.durationDays !== undefined
        ? isMilestone
          ? 0
          : this.hoursToDurationDays(
              body.durationDays * HOURS_PER_WORK_DAY,
              false,
            )
        : this.hoursToDurationDays(durationHours, isMilestone);
    const dates = this.resolveDates({
      startDate:
        body.startDate ?? this.formatDateOnly(current.startDate) ?? undefined,
      endDate:
        body.endDate ?? this.formatDateOnly(current.endDate) ?? undefined,
      durationDays,
      isMilestone,
    });

    const progressPercent =
      body.progressPercent !== undefined
        ? body.progressPercent
        : current.progressPercent;

    if (progressPercent > 0 && current.progressPercent === 0) {
      const predIds =
        body.predecessorIds ??
        (
          await this.prisma.projectActivityPredecessor.findMany({
            where: { activityId },
            select: { predecessorId: true },
          })
        ).map((row) => row.predecessorId);
      await this.assertPredecessorsCompleted(predIds);
    }

    const statusDerived = this.deriveActivityStatus(
      progressPercent,
      current.activityStatus,
    );
    const wasCompleted =
      current.activityStatus === ProjectActivityStatus.COMPLETED;

    await this.prisma.projectActivity.update({
      where: { id: activityId },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        kind,
        durationDays: dates.durationDays,
        durationHours: isMilestone ? 0 : durationHours,
        startDate: dates.startDate,
        endDate: dates.endDate,
        ...(body.actualDurationDays !== undefined
          ? {
              actualDurationDays: body.actualDurationDays,
              actualDurationHours: body.actualDurationDays * HOURS_PER_WORK_DAY,
            }
          : body.actualDurationHours !== undefined
            ? {
                actualDurationHours: body.actualDurationHours,
                actualDurationDays: this.hoursToDurationDays(
                  body.actualDurationHours,
                  false,
                ),
              }
            : {}),
        progressPercent,
        activityStatus: statusDerived.activityStatus,
        completedAt: statusDerived.completedAt,
        ...(body.assigneeUserId !== undefined
          ? {
              assigneeUserId: body.assigneeUserId,
              assigneeName: body.assigneeUserId
                ? null
                : (body.assigneeName ?? null),
            }
          : body.assigneeName !== undefined
            ? { assigneeName: body.assigneeName?.trim() || null }
            : {}),
        ...(body.isMilestone !== undefined
          ? { isMilestone: body.isMilestone }
          : {}),
        ...(body.notes !== undefined
          ? { notes: body.notes?.trim() || null }
          : {}),
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

    const eventType =
      !wasCompleted &&
      statusDerived.activityStatus === ProjectActivityStatus.COMPLETED
        ? ProjectHistoryEventType.TASK_COMPLETED
        : ProjectHistoryEventType.TASK_UPDATED;
    await this.logProjectHistory({
      projectId: current.projectId,
      eventType,
      summary:
        eventType === ProjectHistoryEventType.TASK_COMPLETED
          ? `Atividade concluída: ${body.name?.trim() ?? current.name}`
          : `Atividade atualizada: ${body.name?.trim() ?? current.name}`,
      actorUserId: user.userId,
      entityType: kind,
      entityId: activityId,
    });

    if (current.parentId) {
      await this.syncPhaseChain(current.parentId);
    }

    return this.getProject(user, current.projectId);
  }

  async deleteActivity(user: AuthenticatedRequestUser, activityId: string) {
    this.assertCanMutate(user);
    const current = await this.prisma.projectActivity.findFirst({
      where: { id: activityId, deletedAt: null },
      include: { project: true },
    });
    if (!current) {
      throw new NotFoundException('Atividade não encontrada.');
    }
    await this.resolveProjectInScope(user, current.projectId);
    this.assertProjectEditable(current.project.status);
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

    await this.logProjectHistory({
      projectId: current.projectId,
      eventType:
        current.kind === ProjectActivityKind.PHASE
          ? ProjectHistoryEventType.PHASE_DELETED
          : ProjectHistoryEventType.TASK_DELETED,
      summary: `${current.kind === ProjectActivityKind.PHASE ? 'Fase' : 'Atividade'} excluída: ${current.name}`,
      actorUserId: user.userId,
      entityType: current.kind,
      entityId: activityId,
    });

    if (current.parentId) {
      await this.syncPhaseChain(current.parentId);
    }

    return this.getProject(user, current.projectId);
  }

  async searchUsers(
    user: AuthenticatedRequestUser,
    query: SearchProjetosUsersQueryDto,
  ) {
    const q = query.q?.trim();
    const scope = await this.getAccessibleCompanyIds(user);
    const companyId =
      user.role === UserRole.CLIENT
        ? user.companyId
        : (query.companyId ?? null);
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
                  {
                    role: {
                      in: [UserRole.ADMIN, UserRole.COLLABORATOR, UserRole.PJ],
                    },
                  },
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

  async exportImportTemplate(user: AuthenticatedRequestUser) {
    const hideDurations = this.isClientView(user);
    const buffer = await this.excel.buildExportBuffer({
      companyName: '',
      template: true,
      hideDurations,
    });
    return {
      buffer,
      filename: 'modelo-projeto.xlsx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  async exportProject(
    user: AuthenticatedRequestUser,
    projectId: string,
    template: boolean,
  ) {
    const project = await this.getProject(user, projectId);
    const hideDurations = this.isClientView(user);
    const buffer = await this.excel.buildExportBuffer({
      project,
      companyName: project.company.name,
      template,
      hideDurations,
    });
    const suffix = template ? 'modelo-projeto' : `projeto-${project.code}`;
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
