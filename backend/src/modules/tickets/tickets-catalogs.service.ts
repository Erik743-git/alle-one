import { BadRequestException, Injectable } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { isClientPortalRole } from '../../common/security/client-portal-role';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantScopeService } from '../../common/security/tenant-scope.service';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { normalizeDeskName } from './tiflux-portal-desk.config';
import { resolveClientListFilter } from './tickets-client-scope';
import {
  isTicketsPortalCanonical,
  isTicketsTifluxWriteEnabled,
  isTifluxDisconnected,
} from './tickets-portal.config';
import {
  portalResponsibleSyntheticId,
  resolveResponsibleExternalId,
} from './portal-responsible.helper';
import { PORTAL_STAGES_ORDER } from './portal-ticket-stages';
import {
  portalRequestorSyntheticId,
  sanitizeTicketRequestors,
  type TicketRequestorOption,
} from './ticket-requestors.helper';
import { resolveAllowedDeskExternalIdsForCompany } from './company-ticket-specialties.helper';

export type TicketClassificationNode = {
  id: string;
  name: string;
  level: number;
  active: boolean;
  sortOrder: number;
  parentId: string | null;
  children: TicketClassificationNode[];
};

export type TicketCreateCatalogs = {
  clients: Array<{ id: number; name: string; companyId?: string }>;
  desks: Array<{
    id: number;
    name: string;
    appointmentType: string;
    requireServiceCatalog: boolean;
  }>;
  responsibles: Array<{ id: number; name: string; email: string | null }>;
  requestors: Array<{
    id: number;
    name: string;
    email: string | null;
    telephone: string | null;
  }>;
  portalServiceDesk: { id: string; name: string } | null;
  classification: {
    levelLabels: Array<{ level: number; label: string }>;
    tree: TicketClassificationNode[];
    syncedFromTiflux?: boolean;
    usesServiceCatalogTree?: boolean;
  } | null;
  desk: {
    id: number;
    name: string;
    appointmentType: string;
    requireServiceCatalog: boolean;
    requiredFields: Record<string, boolean>;
  } | null;
  priorities: Array<{ id: number; name: string }>;
  catalogItems: Array<{
    id: number;
    name: string;
    catalogId?: number;
    catalogName?: string;
    areaId?: number;
    areaName?: string;
    itemName?: string;
  }>;
  source?: 'portal' | 'tiflux';
};

@Injectable()
export class TicketsCatalogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  private async filterDesksForClientCompany<T extends { id: number }>(
    actor: AuthenticatedRequestUser,
    companyId: string | null | undefined,
    desks: T[],
  ): Promise<T[]> {
    if (!isClientPortalRole(actor.role)) return desks;
    const allowed = await resolveAllowedDeskExternalIdsForCompany(
      this.prisma,
      companyId ?? actor.companyId,
    );
    if (allowed == null) return desks;
    return desks.filter((desk) => allowed.has(Number(desk.id)));
  }

  /** Responsáveis a partir do mirror `tiflux.users` (sem API). */
  async listResponsiblesFromMirror(): Promise<
    Array<{ id: number; name: string; email: string | null }>
  > {
    try {
      const rows =
        (await this.prisma.$queryRaw<
          Array<{ external_id: number; name: string; email: string | null }>
        >`
          SELECT tu.external_id, tu.name, tu.email
          FROM tiflux.users tu
          WHERE COALESCE(tu.active, true) = true
            AND tu.type IN ('attendant', 'admin')
          ORDER BY tu.name ASC
          LIMIT 300
        `) ?? [];
      return rows
        .map((r) => ({
          id: Number(r.external_id),
          name: String(r.name ?? '').trim(),
          email: r.email != null ? String(r.email).trim() : null,
        }))
        .filter((r) => Number.isFinite(r.id) && r.id > 0 && r.name);
    } catch {
      return [];
    }
  }

  /**
   * Fonte de verdade: usuários portal ACTIVE com checkbox `responsible`
   * (qualquer perfil — colaborador, gestor ou membro cliente).
   */
  async listResponsiblesFromPortalUsers(): Promise<
    Array<{ id: number; name: string; email: string | null }>
  > {
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        status: UserStatus.ACTIVE,
        responsible: true,
      },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
      take: 500,
    });

    if (users.length === 0) return [];

    const emailToTifluxId = await this.mapTifluxUserIdsByEmail(
      users.map((u) => u.email),
    );

    return users
      .map((u) => {
        const email = u.email.trim();
        const name = u.name.trim();
        if (!name) return null;
        return {
          id: this.responsibleCatalogId(
            u.id,
            emailToTifluxId.get(email.toLowerCase()),
          ),
          name,
          email: email || null,
        };
      })
      .filter((r): r is { id: number; name: string; email: string | null } =>
        Boolean(r),
      );
  }

  /** @deprecated Preferir listResponsiblesFromPortalUsers (checkbox). */
  async listResponsiblesFromPortal(): Promise<
    Array<{ id: number; name: string; email: string | null }>
  > {
    return this.listResponsiblesFromPortalUsers();
  }

  async listResponsiblesForCatalogs(): Promise<
    Array<{ id: number; name: string; email: string | null }>
  > {
    return this.listResponsiblesFromPortalUsers();
  }

  /** Responsáveis ativos da especialidade vinculada à mesa. */
  async listResponsiblesForDeskExternalId(
    deskExternalId: number,
    deskNameHint?: string | null,
  ): Promise<Array<{ id: number; name: string; email: string | null }>> {
    const portalDesk = await this.findPortalDeskForTifluxDesk(
      deskExternalId,
      deskNameHint,
    );
    if (!portalDesk) return [];

    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        status: UserStatus.ACTIVE,
        responsible: true,
        OR: [
          { userSpecialties: { some: { specialtyId: portalDesk.id } } },
          { specialtyId: portalDesk.id },
        ],
      },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
      take: 500,
    });

    if (users.length === 0) return [];

    const emailToTifluxId = await this.mapTifluxUserIdsByEmail(
      users.map((u) => u.email),
    );

    return users
      .map((u) => {
        const email = u.email.trim();
        const name = u.name.trim();
        if (!name) return null;
        return {
          id: this.responsibleCatalogId(
            u.id,
            emailToTifluxId.get(email.toLowerCase()),
          ),
          name,
          email: email || null,
        };
      })
      .filter((r): r is { id: number; name: string; email: string | null } =>
        Boolean(r),
      );
  }

  /**
   * Usuários ativos da empresa do cliente (qualquer perfil) —
   * usados como opções de responsável no portal cliente.
   */
  async listCompanyUsersAsResponsibles(
    companyId: string,
  ): Promise<Array<{ id: number; name: string; email: string | null }>> {
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        status: UserStatus.ACTIVE,
        OR: [{ companyId }, { companyMemberships: { some: { companyId } } }],
      },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
      take: 500,
    });

    if (users.length === 0) return [];

    const emailToTifluxId = await this.mapTifluxUserIdsByEmail(
      users.map((u) => u.email),
    );

    return users
      .map((u) => {
        const email = u.email.trim();
        const name = u.name.trim();
        if (!name) return null;
        return {
          id: this.responsibleCatalogId(
            u.id,
            emailToTifluxId.get(email.toLowerCase()),
          ),
          name,
          email: email || null,
        };
      })
      .filter((r): r is { id: number; name: string; email: string | null } =>
        Boolean(r),
      );
  }

  /** Sem TiFlux (teste/cutover): chave estável do usuário portal, não ID da API. */
  private responsibleCatalogId(
    userId: string,
    tifluxId: number | undefined,
  ): number {
    if (isTifluxDisconnected()) {
      return portalResponsibleSyntheticId(userId);
    }
    return resolveResponsibleExternalId(userId, tifluxId ?? null);
  }

  private async mapTifluxUserIdsByEmail(
    emails: string[],
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (isTifluxDisconnected() || emails.length === 0) return map;
    try {
      const normalized = emails
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
      const rows =
        (await this.prisma.$queryRaw<
          Array<{ external_id: number; email: string }>
        >`
          SELECT tu.external_id, lower(trim(tu.email)) AS email
          FROM tiflux.users tu
          WHERE COALESCE(tu.active, true) = true
            AND lower(trim(tu.email)) = ANY(${normalized}::text[])
          ORDER BY tu.external_id ASC
        `) ?? [];
      for (const row of rows) {
        const email = String(row.email ?? '').trim();
        const id = Number(row.external_id);
        if (!email || !Number.isFinite(id) || id <= 0) continue;
        if (!map.has(email)) map.set(email, id);
      }
    } catch {
      // Sem schema tiflux: IDs sintéticos.
    }
    return map;
  }

  private async resolveResponsiblesForCreateCatalogs(
    actor: AuthenticatedRequestUser,
  ): Promise<Array<{ id: number; name: string; email: string | null }>> {
    if (isClientPortalRole(actor.role)) {
      if (!actor.companyId) return [];
      return this.listCompanyUsersAsResponsibles(actor.companyId);
    }
    return this.listResponsiblesForCatalogs();
  }

  private buildClassificationTree(
    rows: Array<{
      id: string;
      name: string;
      level: number;
      active: boolean;
      sortOrder: number;
      parentId: string | null;
    }>,
    maxLevel = 3,
  ): TicketClassificationNode[] {
    const byParent = new Map<string | null, typeof rows>();
    for (const row of rows) {
      if (row.level > maxLevel) continue;
      const bucket = byParent.get(row.parentId);
      if (bucket) bucket.push(row);
      else byParent.set(row.parentId, [row]);
    }

    const sortRows = (list: typeof rows) =>
      [...list].sort(
        (a, b) =>
          a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'pt-BR'),
      );

    const toNode = (row: (typeof rows)[number]): TicketClassificationNode => ({
      ...row,
      children:
        row.level < maxLevel
          ? sortRows(byParent.get(row.id) ?? []).map(toNode)
          : [],
    });

    return sortRows(byParent.get(null) ?? []).map(toNode);
  }

  private async findPortalDeskForTifluxDesk(
    tifluxDeskId: number,
    tifluxDeskName?: string | null,
  ) {
    const candidates: Array<{ id: string; name: string }> = [];

    const byExternalId = await this.prisma.specialty.findFirst({
      where: { externalId: tifluxDeskId, deletedAt: null, active: true },
      select: { id: true, name: true },
    });
    if (byExternalId) candidates.push(byExternalId);

    const normalizedTarget = normalizeDeskName(tifluxDeskName);
    if (normalizedTarget) {
      const portalDesks = await this.prisma.specialty.findMany({
        where: { deletedAt: null, active: true },
        select: { id: true, name: true },
      });
      const byName = portalDesks.find(
        (desk) => normalizeDeskName(desk.name) === normalizedTarget,
      );
      if (byName && !candidates.some((desk) => desk.id === byName.id)) {
        candidates.push(byName);
      }
    }

    if (candidates.length === 0) return null;

    const withCounts = await Promise.all(
      candidates.map(async (desk) => ({
        desk,
        count: await this.prisma.specialtyClassification.count({
          where: { specialtyId: desk.id, active: true },
        }),
      })),
    );

    const withClassifications = withCounts.filter((row) => row.count > 0);
    if (withClassifications.length > 0) {
      return withClassifications[0].desk;
    }

    return candidates[0];
  }

  private async loadClassificationBundle(
    tifluxDeskId: number,
    tifluxDeskName?: string | null,
  ) {
    const portalDesk = await this.findPortalDeskForTifluxDesk(
      tifluxDeskId,
      tifluxDeskName,
    );
    if (!portalDesk) {
      return {
        portalServiceDesk: null,
        portalSpecialty: null,
        classification: null,
      };
    }

    const rows = await this.prisma.specialtyClassification.findMany({
      where: { specialtyId: portalDesk.id, active: true },
      orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        level: true,
        active: true,
        sortOrder: true,
        parentId: true,
        catalogNodeKind: true,
      },
    });

    const usesServiceCatalogTree =
      rows.some((row) => row.level >= 3) ||
      rows.some((row) => row.catalogNodeKind != null);
    const maxLevel = usesServiceCatalogTree ? 3 : 2;
    const levelLabels = usesServiceCatalogTree
      ? [
          { level: 1, label: 'Catálogo' },
          { level: 2, label: 'Área' },
          { level: 3, label: 'Serviço' },
        ]
      : [
          { level: 1, label: 'Categoria' },
          { level: 2, label: 'Subcategoria' },
        ];

    return {
      portalServiceDesk: portalDesk,
      portalSpecialty: portalDesk,
      classification: {
        levelLabels,
        tree: this.buildClassificationTree(rows, maxLevel),
        usesServiceCatalogTree,
        syncedFromTiflux: usesServiceCatalogTree,
      },
    };
  }

  async resolveTifluxServiceItemIdFromClassification(
    classificationId?: string | null,
  ): Promise<number | null> {
    if (!isTicketsTifluxWriteEnabled()) return null;
    if (!classificationId?.trim()) return null;
    const row = await this.prisma.specialtyClassification.findFirst({
      where: {
        id: classificationId.trim(),
        active: true,
        catalogNodeKind: 'service',
        legacySourceId: { not: null },
      },
      select: { legacySourceId: true },
    });
    if (!row?.legacySourceId) return null;
    return row.legacySourceId;
  }

  async resolveClassificationPathLabel(
    classificationId: string,
  ): Promise<string | null> {
    const row = await this.prisma.specialtyClassification.findFirst({
      where: { id: classificationId, active: true },
      select: { id: true, name: true, parentId: true, level: true },
    });
    if (!row) return null;

    const names: string[] = [row.name];
    let parentId = row.parentId;
    while (parentId) {
      const parent = await this.prisma.specialtyClassification.findUnique({
        where: { id: parentId },
        select: { name: true, parentId: true },
      });
      if (!parent) break;
      names.unshift(parent.name);
      parentId = parent.parentId;
    }

    const desk = await this.prisma.specialtyClassification.findUnique({
      where: { id: row.id },
      select: {
        specialty: { select: { name: true } },
      },
    });

    if (desk?.specialty?.name) {
      names.unshift(desk.specialty.name);
    }

    return names.join(' → ');
  }

  async assertValidClassificationForDesk(
    tifluxDeskId: number,
    classificationId?: string | null,
    tifluxDeskName?: string | null,
  ) {
    const bundle = await this.loadClassificationBundle(
      tifluxDeskId,
      tifluxDeskName,
    );
    const tree = bundle.classification?.tree ?? [];
    if (tree.length === 0) {
      return;
    }

    if (!classificationId?.trim()) {
      throw new BadRequestException(
        'Selecione a classificação cadastrada para esta especialidade.',
      );
    }

    const node = await this.prisma.specialtyClassification.findFirst({
      where: {
        id: classificationId,
        active: true,
        specialtyId: bundle.portalServiceDesk?.id,
      },
      select: { id: true, level: true },
    });
    if (!node) {
      throw new BadRequestException(
        'Classificação inválida para esta especialidade.',
      );
    }

    const usesServiceCatalogTree =
      bundle.classification?.usesServiceCatalogTree ?? false;
    const maxLevel = usesServiceCatalogTree ? 3 : 2;
    const hasChildren = await this.prisma.specialtyClassification.count({
      where: {
        parentId: node.id,
        active: true,
        level: { lte: maxLevel },
      },
    });
    if (hasChildren > 0) {
      throw new BadRequestException(
        'Selecione o nível mais específico da classificação.',
      );
    }
  }

  async getFilterCatalogs(actor: AuthenticatedRequestUser) {
    const clientScope = await resolveClientListFilter(
      this.tenantScope,
      actor,
      null,
    );
    const clientFilter = clientScope.clientExternalId;

    if (isTicketsPortalCanonical()) {
      return this.getFilterCatalogsFromPortal(actor, clientFilter);
    }

    const [stages, clients, responsibles, desks, statuses] = await Promise.all([
      this.prisma.$queryRaw<Array<{ stage_name: string }>>`
        SELECT DISTINCT trim(t.stage_name) AS stage_name
        FROM tiflux.tickets t
        WHERE t.stage_name IS NOT NULL AND trim(t.stage_name) <> ''
          AND COALESCE(t.is_closed, false) = false
          AND (${clientFilter ?? null}::int IS NULL OR t.client_external_id = ${clientFilter ?? null})
        ORDER BY stage_name ASC
        LIMIT 80
      `,
      this.prisma.$queryRaw<
        Array<{ client_external_id: number; client_name: string }>
      >`
        SELECT DISTINCT t.client_external_id, t.client_name
        FROM tiflux.tickets t
        WHERE t.client_external_id IS NOT NULL AND t.client_name IS NOT NULL
          AND COALESCE(t.is_closed, false) = false
          AND (${clientFilter ?? null}::int IS NULL OR t.client_external_id = ${clientFilter ?? null})
        ORDER BY t.client_name ASC
        LIMIT 200
      `,
      this.listResponsiblesForCatalogs(),
      this.prisma.$queryRaw<Array<{ desk_name: string }>>`
        SELECT DISTINCT trim(t.desk_name) AS desk_name
        FROM tiflux.tickets t
        WHERE t.desk_name IS NOT NULL AND trim(t.desk_name) <> ''
          AND COALESCE(t.is_closed, false) = false
          AND (${clientFilter ?? null}::int IS NULL OR t.client_external_id = ${clientFilter ?? null})
        ORDER BY desk_name ASC
        LIMIT 50
      `,
      this.prisma.$queryRaw<Array<{ status_name: string }>>`
        SELECT DISTINCT trim(t.status_name) AS status_name
        FROM tiflux.tickets t
        WHERE t.status_name IS NOT NULL AND trim(t.status_name) <> ''
          AND COALESCE(t.is_closed, false) = false
          AND (${clientFilter ?? null}::int IS NULL OR t.client_external_id = ${clientFilter ?? null})
        ORDER BY status_name ASC
        LIMIT 30
      `,
    ]);

    return {
      stages: stages.map((s) => s.stage_name),
      clients: clients.map((c) => ({
        externalId: Number(c.client_external_id),
        name: c.client_name,
      })),
      requestors: isClientPortalRole(actor.role)
        ? []
        : (
            await this.prisma.portalTicket.findMany({
              where: {
                ...(clientFilter != null
                  ? { clientExternalId: clientFilter }
                  : {}),
                OR: [
                  { requestorName: { not: null } },
                  { requestorEmail: { not: null } },
                ],
              },
              select: { requestorName: true, requestorEmail: true },
              take: 3000,
            })
          )
            .map(
              (row) =>
                row.requestorName?.trim() || row.requestorEmail?.trim() || '',
            )
            .filter((name): name is string => Boolean(name))
            .filter((name, index, arr) => arr.indexOf(name) === index)
            .sort((a, b) => a.localeCompare(b, 'pt-BR'))
            .map((name) => ({ name })),
      responsibles: isClientPortalRole(actor.role)
        ? []
        : responsibles.map((r) => ({
            externalId: r.id,
            name: r.name,
            email: r.email,
          })),
      desks: desks.map((d) => d.desk_name),
      statuses: statuses.map((s) => s.status_name),
    };
  }

  private async getFilterCatalogsFromPortal(
    actor: AuthenticatedRequestUser,
    clientFilter: number | null,
  ) {
    const whereTickets = {
      ...(clientFilter != null ? { clientExternalId: clientFilter } : {}),
    } as const;

    const [tickets, responsibles] = await Promise.all([
      this.prisma.portalTicket.findMany({
        where: whereTickets,
        select: {
          clientExternalId: true,
          clientName: true,
          deskName: true,
          requestorName: true,
          requestorEmail: true,
        },
        take: 2000,
      }),
      this.listResponsiblesForCatalogs(),
    ]);

    // Catálogo canônico: inclui Resolvido / Encerrado / Cancelado mesmo sem tickets abertos.
    const stages = [...PORTAL_STAGES_ORDER];

    const clientMap = new Map<number, string>();
    for (const t of tickets) {
      if (t.clientExternalId == null || !t.clientName?.trim()) continue;
      clientMap.set(t.clientExternalId, t.clientName.trim());
    }

    const desks = [
      ...new Set(
        tickets
          .map((t) => t.deskName?.trim())
          .filter((v): v is string => Boolean(v)),
      ),
    ].sort((a, b) => a.localeCompare(b, 'pt-BR'));

    const responsibleMap = new Map<
      number,
      { externalId: number; name: string; email: string | null }
    >();
    for (const r of responsibles) {
      responsibleMap.set(r.id, {
        externalId: r.id,
        name: r.name,
        email: r.email,
      });
    }

    const requestors = [
      ...new Set(
        tickets
          .map((t) => t.requestorName?.trim() || t.requestorEmail?.trim() || '')
          .filter(Boolean),
      ),
    ]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map((name) => ({ name }));

    return {
      stages,
      clients: [...clientMap.entries()]
        .map(([externalId, name]) => ({ externalId, name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
      requestors,
      responsibles: isClientPortalRole(actor.role)
        ? []
        : [...responsibleMap.values()].sort((a, b) =>
            a.name.localeCompare(b.name, 'pt-BR'),
          ),
      desks,
      // Mantido por compat da API; UI de lista usa só Estágio.
      statuses: stages,
    };
  }

  async getCreateCatalogs(
    actor: AuthenticatedRequestUser,
    deskId?: number,
    clientId?: number,
  ): Promise<TicketCreateCatalogs> {
    return this.getCreateCatalogsFromPortal(actor, deskId, clientId);
  }

  /** Catálogos de criação sem API TiFlux (empresas + especialidades + usuários do portal). */
  private async getCreateCatalogsFromPortal(
    actor: AuthenticatedRequestUser,
    deskId?: number,
    clientId?: number,
  ): Promise<TicketCreateCatalogs> {
    const [companies, desks, defaultResponsibles] = await Promise.all([
      this.prisma.company.findMany({
        where: {
          deletedAt: null,
          status: true,
          tifluxClientId: { not: null },
        },
        select: {
          id: true,
          tifluxClientId: true,
          tifluxClientName: true,
          name: true,
        },
        orderBy: { name: 'asc' },
        take: 500,
      }),
      this.prisma.specialty.findMany({
        where: { deletedAt: null, active: true },
        select: { id: true, externalId: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.resolveResponsiblesForCreateCatalogs(actor),
    ]);

    let responsibles = defaultResponsibles;

    const allowedClientIds = isClientPortalRole(actor.role)
      ? await this.tenantScope.resolveTifluxClientIdsForTicketCreate(actor)
      : undefined;
    const allowedSet =
      allowedClientIds != null ? new Set(allowedClientIds.map(Number)) : null;

    const clients = companies
      .map((c) => ({
        id: Number(c.tifluxClientId),
        name: (c.tifluxClientName?.trim() || c.name).trim(),
        companyId: c.id,
      }))
      .filter(
        (c) =>
          Number.isFinite(c.id) && (allowedSet == null || allowedSet.has(c.id)),
      );

    const deskOptionsRaw = desks
      .map((d) => ({
        id: d.externalId != null ? Number(d.externalId) : null,
        name: d.name,
        specialtyId: d.id,
        appointmentType: '',
        requireServiceCatalog: false,
      }))
      .filter(
        (d): d is typeof d & { id: number } =>
          d.id != null && Number.isFinite(d.id),
      );

    let portalServiceDesk: { id: string; name: string } | null = null;
    let classification: TicketCreateCatalogs['classification'] = null;
    let deskMeta: TicketCreateCatalogs['desk'] = null;

    let requestors: TicketRequestorOption[] = [];
    const scopedClientId =
      allowedSet != null
        ? clientId != null && allowedSet.has(Number(clientId))
          ? Number(clientId)
          : allowedClientIds?.[0] != null
            ? Number(allowedClientIds[0])
            : undefined
        : clientId;

    const scopedCompanyForDesks =
      scopedClientId != null
        ? companies.find((c) => Number(c.tifluxClientId) === scopedClientId)?.id
        : actor.companyId;

    const deskOptions = await this.filterDesksForClientCompany(
      actor,
      scopedCompanyForDesks ?? null,
      deskOptionsRaw,
    );

    if (deskId != null && Number.isFinite(deskId)) {
      const matched = desks.find((d) => Number(d.externalId) === deskId);
      const deskName = matched?.name ?? `Mesa ${deskId}`;
      const bundle = await this.loadClassificationBundle(deskId, deskName);
      portalServiceDesk = bundle.portalServiceDesk;
      classification = bundle.classification;
      const usesServiceCatalog =
        bundle.classification?.usesServiceCatalogTree ?? false;
      deskMeta = {
        id: deskId,
        name: deskName,
        appointmentType: '',
        requireServiceCatalog: usesServiceCatalog,
        requiredFields: {},
      };
      if (!isClientPortalRole(actor.role)) {
        const byDesk = await this.listResponsiblesForDeskExternalId(
          deskId,
          deskName,
        );
        responsibles =
          byDesk.length > 0 ? byDesk : await this.listResponsiblesForCatalogs();
      }
    }

    if (
      scopedClientId != null &&
      Number.isFinite(scopedClientId) &&
      (allowedSet == null || allowedSet.has(Number(scopedClientId)))
    ) {
      const clientName =
        clients.find((c) => c.id === scopedClientId)?.name ?? null;
      const company = companies.find(
        (c) => Number(c.tifluxClientId) === scopedClientId,
      );
      requestors = await this.listPortalRequestorsForClient({
        clientExternalId: scopedClientId,
        companyId: company?.id ?? null,
        clientName,
      });
      if (!isClientPortalRole(actor.role)) {
        requestors = await this.appendActorAsRequestorIfMissing(
          actor,
          requestors,
        );
      }
    }

    return {
      clients,
      desks: deskOptions,
      responsibles,
      requestors,
      portalServiceDesk,
      classification,
      desk: deskMeta,
      priorities: [],
      catalogItems: [],
      source: 'portal',
    };
  }

  /** Solicitantes no modo portal: usuários da empresa + e-mails já usados em tickets. */
  private async listPortalRequestorsForClient(params: {
    clientExternalId: number;
    companyId: string | null;
    clientName: string | null;
  }): Promise<TicketRequestorOption[]> {
    const rows: TicketRequestorOption[] = [];

    if (params.companyId) {
      const users = await this.prisma.user.findMany({
        where: {
          companyId: params.companyId,
          deletedAt: null,
          status: UserStatus.ACTIVE,
        },
        select: { name: true, email: true },
        take: 2000,
      });
      for (const user of users) {
        const email = user.email?.trim();
        if (!email) continue;
        rows.push({
          id: portalRequestorSyntheticId(email),
          name: user.name?.trim() || email,
          email,
          telephone: null,
        });
      }
    }

    const ticketRows = await this.prisma.portalTicket.findMany({
      where: {
        clientExternalId: params.clientExternalId,
        OR: [
          { requestorEmail: { not: null } },
          { requestorName: { not: null } },
        ],
      },
      select: {
        requestorName: true,
        requestorEmail: true,
        requestorTelephone: true,
      },
      orderBy: { updatedAtSource: 'desc' },
      take: 3000,
    });

    for (const row of ticketRows) {
      const email = row.requestorEmail?.trim() || null;
      const name = row.requestorName?.trim() || email || '';
      if (!email && !name) continue;
      rows.push({
        id: email
          ? portalRequestorSyntheticId(email)
          : portalRequestorSyntheticId(`name:${name}`),
        name,
        email,
        telephone: row.requestorTelephone?.trim() || null,
      });
    }

    return sanitizeTicketRequestors(rows, { clientName: params.clientName });
  }

  /** Colaborador interno abrindo ticket: inclui o usuário logado na lista de solicitantes. */
  private async appendActorAsRequestorIfMissing(
    actor: AuthenticatedRequestUser,
    requestors: TicketRequestorOption[],
  ): Promise<TicketRequestorOption[]> {
    const email = actor.email?.trim();
    if (!email) return requestors;
    const normalized = email.toLowerCase();
    if (
      requestors.some((row) => row.email?.trim().toLowerCase() === normalized)
    ) {
      return requestors;
    }
    const dbUser = await this.prisma.user.findFirst({
      where: { id: actor.userId, deletedAt: null },
      select: { name: true },
    });
    return [
      {
        id: portalRequestorSyntheticId(email),
        name: dbUser?.name?.trim() || email,
        email,
        telephone: null,
      },
      ...requestors,
    ];
  }
}
