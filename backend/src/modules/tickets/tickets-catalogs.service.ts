import { BadRequestException, Injectable } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantScopeService } from '../../common/security/tenant-scope.service';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { TifluxService } from '../tiflux/tiflux.service';
import { normalizeDeskName } from './tiflux-portal-desk.config';
import { resolveClientListFilter } from './tickets-client-scope';
import {
  isTicketsPortalCanonical,
  isTicketsTifluxWriteEnabled,
} from './tickets-portal.config';
import {
  portalRequestorSyntheticId,
  sanitizeTicketRequestors,
  type TicketRequestorOption,
} from './ticket-requestors.helper';

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
  clients: Array<{ id: number; name: string }>;
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
  } | null;
  desk: {
    id: number;
    name: string;
    appointmentType: string;
    requireServiceCatalog: boolean;
    requiredFields: Record<string, boolean>;
  } | null;
  priorities: Array<{ id: number; name: string }>;
  catalogItems: Array<{ id: number; name: string }>;
  source?: 'portal' | 'tiflux';
};

@Injectable()
export class TicketsCatalogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tiflux: TifluxService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  async listTifluxResponsiblesForTicketCreate(): Promise<
    Array<{ id: number; name: string; email: string | null }>
  > {
    const [attendants, admins] = await Promise.all([
      this.tiflux.getUsersAll({
        active: true,
        type: 'attendant',
        limitPerPage: 100,
        maxPages: 20,
      }),
      this.tiflux.getUsersAll({
        active: true,
        type: 'admin',
        limitPerPage: 100,
        maxPages: 10,
      }),
    ]);

    const byId = new Map<
      number,
      { id: number; name: string; email: string | null }
    >();
    for (const user of [...attendants, ...admins]) {
      const id = Number(user.id);
      if (!Number.isFinite(id) || id <= 0) continue;
      const name = String(user.name ?? '').trim();
      if (!name) continue;
      byId.set(id, {
        id,
        name,
        email: user.email != null ? String(user.email).trim() : null,
      });
    }

    return [...byId.values()].sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR'),
    );
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
   * Responsáveis sem depender de `tiflux.users`: DISTINCT em portal_tickets
   * + e-mail do User portal quando o nome casa.
   */
  async listResponsiblesFromPortal(): Promise<
    Array<{ id: number; name: string; email: string | null }>
  > {
    const tickets = await this.prisma.portalTicket.findMany({
      where: {
        isClosed: false,
        responsibleExternalId: { not: null },
        responsibleName: { not: null },
      },
      select: { responsibleExternalId: true, responsibleName: true },
      take: 3000,
    });

    const byId = new Map<
      number,
      { id: number; name: string; email: string | null }
    >();
    for (const t of tickets) {
      const id = t.responsibleExternalId;
      const name = t.responsibleName?.trim();
      if (id == null || !name) continue;
      if (!byId.has(id)) {
        byId.set(id, { id, name, email: null });
      }
    }

    const users = await this.prisma.user.findMany({
      where: { deletedAt: null, status: 'ACTIVE' },
      select: { name: true, email: true },
      take: 500,
    });
    const emailByName = new Map(
      users.map((u) => [u.name.trim().toLowerCase(), u.email.trim()]),
    );
    for (const r of byId.values()) {
      const email = emailByName.get(r.name.toLowerCase());
      if (email) r.email = email;
    }

    return [...byId.values()].sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR'),
    );
  }

  async listResponsiblesForCatalogs(): Promise<
    Array<{ id: number; name: string; email: string | null }>
  > {
    if (isTicketsPortalCanonical()) {
      const fromPortal = await this.listResponsiblesFromPortal();
      if (fromPortal.length) return fromPortal;
    }
    return this.listResponsiblesFromMirror();
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
  ): TicketClassificationNode[] {
    const byParent = new Map<string | null, typeof rows>();
    for (const row of rows) {
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
        row.level < 3
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

    const byExternalId = await this.prisma.serviceDesk.findFirst({
      where: { externalId: tifluxDeskId, deletedAt: null, active: true },
      select: { id: true, name: true },
    });
    if (byExternalId) candidates.push(byExternalId);

    const normalizedTarget = normalizeDeskName(tifluxDeskName);
    if (normalizedTarget) {
      const portalDesks = await this.prisma.serviceDesk.findMany({
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
        count: await this.prisma.serviceDeskClassification.count({
          where: { serviceDeskId: desk.id, active: true },
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
      return { portalServiceDesk: null, classification: null };
    }

    const rows = await this.prisma.serviceDeskClassification.findMany({
      where: { serviceDeskId: portalDesk.id, active: true },
      orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        level: true,
        active: true,
        sortOrder: true,
        parentId: true,
      },
    });

    return {
      portalServiceDesk: portalDesk,
      classification: {
        levelLabels: [
          { level: 1, label: 'Categoria' },
          { level: 2, label: 'Subcategoria' },
          { level: 3, label: 'Produto/solução' },
        ],
        tree: this.buildClassificationTree(rows),
      },
    };
  }

  async resolveClassificationPathLabel(
    classificationId: string,
  ): Promise<string | null> {
    const row = await this.prisma.serviceDeskClassification.findFirst({
      where: { id: classificationId, active: true },
      select: { id: true, name: true, parentId: true, level: true },
    });
    if (!row) return null;

    const names: string[] = [row.name];
    let parentId = row.parentId;
    while (parentId) {
      const parent = await this.prisma.serviceDeskClassification.findUnique({
        where: { id: parentId },
        select: { name: true, parentId: true },
      });
      if (!parent) break;
      names.unshift(parent.name);
      parentId = parent.parentId;
    }

    const desk = await this.prisma.serviceDeskClassification.findUnique({
      where: { id: row.id },
      select: {
        serviceDesk: { select: { name: true } },
      },
    });

    if (desk?.serviceDesk?.name) {
      names.unshift(desk.serviceDesk.name);
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
        'Selecione a classificação cadastrada para esta mesa.',
      );
    }

    const node = await this.prisma.serviceDeskClassification.findFirst({
      where: {
        id: classificationId,
        active: true,
        serviceDeskId: bundle.portalServiceDesk?.id,
      },
      select: { id: true, level: true },
    });
    if (!node) {
      throw new BadRequestException('Classificação inválida para esta mesa.');
    }

    const hasChildren = await this.prisma.serviceDeskClassification.count({
      where: { parentId: node.id, active: true },
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
      this.prisma.$queryRaw<
        Array<{ external_id: number; name: string; email: string | null }>
      >`
        SELECT tu.external_id, tu.name, tu.email
        FROM tiflux.users tu
        WHERE COALESCE(tu.active, true) = true
          AND tu.type IN ('attendant', 'admin')
        ORDER BY tu.name ASC
        LIMIT 300
      `,
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
      responsibles:
        actor.role === 'CLIENT'
          ? []
          : responsibles.map((r) => ({
              externalId: Number(r.external_id),
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
    const whereOpen = {
      isClosed: false,
      ...(clientFilter != null ? { clientExternalId: clientFilter } : {}),
    } as const;

    const [tickets, responsibles] = await Promise.all([
      this.prisma.portalTicket.findMany({
        where: whereOpen,
        select: {
          stageName: true,
          clientExternalId: true,
          clientName: true,
          deskName: true,
          statusName: true,
          responsibleExternalId: true,
          responsibleName: true,
        },
        take: 2000,
      }),
      this.listResponsiblesForCatalogs(),
    ]);

    const stages = [
      ...new Set(
        tickets
          .map((t) => t.stageName?.trim())
          .filter((v): v is string => Boolean(v)),
      ),
    ].sort((a, b) => a.localeCompare(b, 'pt-BR'));

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

    const statuses = [
      ...new Set(
        tickets
          .map((t) => t.statusName?.trim())
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
    for (const t of tickets) {
      if (t.responsibleExternalId == null || !t.responsibleName?.trim()) {
        continue;
      }
      if (!responsibleMap.has(t.responsibleExternalId)) {
        responsibleMap.set(t.responsibleExternalId, {
          externalId: t.responsibleExternalId,
          name: t.responsibleName.trim(),
          email: null,
        });
      }
    }

    return {
      stages,
      clients: [...clientMap.entries()]
        .map(([externalId, name]) => ({ externalId, name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
      responsibles:
        actor.role === 'CLIENT'
          ? []
          : [...responsibleMap.values()].sort((a, b) =>
              a.name.localeCompare(b.name, 'pt-BR'),
            ),
      desks,
      statuses,
    };
  }

  private mapCatalogItem(row: Record<string, unknown>) {
    const id = Number(row.id);
    const name = String(row.name ?? row.display_name ?? '').trim();
    const catalog = row.catalog as { name?: string } | null | undefined;
    const area = row.area as { name?: string } | null | undefined;
    const parts = [catalog?.name, area?.name, name]
      .map((part) => String(part ?? '').trim())
      .filter(Boolean);
    return { id, name: parts.join(' → ') || name || `Item ${id}` };
  }

  async getCreateCatalogs(
    deskId?: number,
    clientId?: number,
  ): Promise<TicketCreateCatalogs> {
    if (!isTicketsTifluxWriteEnabled()) {
      return this.getCreateCatalogsFromPortal(deskId, clientId);
    }

    const [clientsRaw, desksRaw, responsibles] = await Promise.all([
      this.tiflux.getClientsAll({ active: true, maxPages: 30 }),
      this.tiflux.getDesksAll({ active: true, maxPages: 10 }),
      this.listTifluxResponsiblesForTicketCreate(),
    ]);

    let requestors: TicketRequestorOption[] = [];
    if (clientId != null && Number.isFinite(clientId)) {
      const clientName =
        clientsRaw
          .map((c) => ({
            id: Number(c.id),
            name: String(c.name ?? c.social_name ?? ''),
          }))
          .find((c) => c.id === clientId)?.name ?? null;
      const raw = await this.tiflux.getClientRequestors(clientId, {
        limitPerPage: 200,
        maxPages: 30,
      });
      requestors = sanitizeTicketRequestors(raw, { clientName });
    }

    let desk: Record<string, unknown> | null = null;
    let priorities: Array<{ id: number; name: string }> = [];
    let catalogItems: Array<{ id: number; name: string }> = [];
    let portalServiceDesk: { id: string; name: string } | null = null;
    let classification: TicketCreateCatalogs['classification'] = null;

    if (deskId != null && Number.isFinite(deskId)) {
      desk = await this.tiflux.getDesk(deskId);
      const tifluxDeskName = String(desk.display_name ?? desk.name ?? '');
      const bundle = await this.loadClassificationBundle(deskId, tifluxDeskName);
      portalServiceDesk = bundle.portalServiceDesk;
      classification = bundle.classification;

      const requiresCatalog = Boolean(desk.require_service_catalog_open_ticket);

      if (requiresCatalog) {
        const items = await this.tiflux.getDeskServicesCatalogItems(deskId);
        catalogItems = items.map((row) => this.mapCatalogItem(row));
      } else {
        const rows = await this.tiflux.getDeskPriorities(deskId);
        priorities = rows.map((row) => this.mapCatalogItem(row));
      }
    }

    return {
      clients: clientsRaw
        .map((c) => ({
          id: Number(c.id),
          name: String(c.name ?? c.social_name ?? `Cliente ${c.id}`),
        }))
        .filter((c) => Number.isFinite(c.id)),
      desks: desksRaw
        .map((d) => ({
          id: Number(d.id),
          name: String(d.display_name ?? d.name ?? `Mesa ${d.id}`),
          appointmentType: String(d.appointment_type ?? ''),
          requireServiceCatalog: Boolean(d.require_service_catalog_open_ticket),
        }))
        .filter((d) => Number.isFinite(d.id)),
      responsibles,
      requestors,
      portalServiceDesk,
      classification,
      desk: desk
        ? {
            id: Number(desk.id),
            name: String(desk.display_name ?? desk.name ?? ''),
            appointmentType: String(desk.appointment_type ?? ''),
            requireServiceCatalog: Boolean(
              desk.require_service_catalog_open_ticket,
            ),
            requiredFields:
              (desk.required_fields as Record<string, boolean> | null) ?? {},
          }
        : null,
      priorities,
      catalogItems,
      source: 'tiflux' as const,
    };
  }

  /** Catálogos de criação sem API TiFlux (Company + service_desks + mirror users). */
  private async getCreateCatalogsFromPortal(
    deskId?: number,
    clientId?: number,
  ): Promise<TicketCreateCatalogs> {
    const [companies, desks, responsibles] = await Promise.all([
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
      this.prisma.serviceDesk.findMany({
        where: { deletedAt: null, active: true, externalId: { not: null } },
        select: { id: true, externalId: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.listResponsiblesForCatalogs(),
    ]);

    const clients = companies
      .map((c) => ({
        id: Number(c.tifluxClientId),
        name: (c.tifluxClientName?.trim() || c.name).trim(),
      }))
      .filter((c) => Number.isFinite(c.id));

    const deskOptions = desks
      .map((d) => ({
        id: Number(d.externalId),
        name: d.name,
        appointmentType: '',
        requireServiceCatalog: false,
      }))
      .filter((d) => Number.isFinite(d.id));

    let portalServiceDesk: { id: string; name: string } | null = null;
    let classification: TicketCreateCatalogs['classification'] = null;
    let deskMeta: TicketCreateCatalogs['desk'] = null;

    if (deskId != null && Number.isFinite(deskId)) {
      const matched = desks.find((d) => Number(d.externalId) === deskId);
      const deskName = matched?.name ?? `Mesa ${deskId}`;
      const bundle = await this.loadClassificationBundle(deskId, deskName);
      portalServiceDesk = bundle.portalServiceDesk;
      classification = bundle.classification;
      deskMeta = {
        id: deskId,
        name: deskName,
        appointmentType: '',
        requireServiceCatalog: false,
        requiredFields: {},
      };
    }

    let requestors: TicketRequestorOption[] = [];
    if (clientId != null && Number.isFinite(clientId)) {
      const clientName =
        clients.find((c) => c.id === clientId)?.name ?? null;
      const company = companies.find(
        (c) => Number(c.tifluxClientId) === clientId,
      );
      requestors = await this.listPortalRequestorsForClient({
        clientExternalId: clientId,
        companyId: company?.id ?? null,
        clientName,
      });
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
}
