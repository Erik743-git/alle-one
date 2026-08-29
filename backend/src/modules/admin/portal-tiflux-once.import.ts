import type { PrismaClient } from '@prisma/client';
import { UserStatus } from '@prisma/client';

export function normalizeMatchName(value: string): string {
  return value.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

export async function linkDeskExternalIdToSpecialty(
  prisma: PrismaClient,
  input: {
    specialtyId: string;
    specialtyName: string;
    deskExternalId: number;
    dryRun?: boolean;
  },
): Promise<{ linked: boolean; message?: string }> {
  const specialty = await prisma.specialty.findUnique({
    where: { id: input.specialtyId },
    select: { id: true, name: true, externalId: true },
  });
  if (!specialty) {
    throw new Error(`Especialidade ${input.specialtyId} não encontrada`);
  }

  if (specialty.externalId === input.deskExternalId) {
    return {
      linked: false,
      message: `external_id já é ${input.deskExternalId}`,
    };
  }

  const conflict = await prisma.specialty.findFirst({
    where: {
      externalId: input.deskExternalId,
      deletedAt: null,
      id: { not: specialty.id },
    },
    select: { id: true, name: true },
  });

  if (input.dryRun) {
    if (conflict) {
      return {
        linked: true,
        message:
          `vincularia external_id → ${input.deskExternalId} ` +
          `(removeria de "${conflict.name}")`,
      };
    }
    if (specialty.externalId != null) {
      return {
        linked: true,
        message:
          `vincularia external_id → ${input.deskExternalId} ` +
          `(substitui ${specialty.externalId})`,
      };
    }
    return {
      linked: true,
      message: `vincularia external_id → ${input.deskExternalId}`,
    };
  }

  await prisma.$transaction(async (tx) => {
    if (conflict) {
      await tx.specialty.update({
        where: { id: conflict.id },
        data: { externalId: null },
      });
    }
    await tx.specialty.update({
      where: { id: specialty.id },
      data: { externalId: input.deskExternalId },
    });
  });

  const parts = [`external_id da especialidade → ${input.deskExternalId}`];
  if (conflict) {
    parts.push(`(removido de "${conflict.name}")`);
  } else if (specialty.externalId != null) {
    parts.push(`(antes: ${specialty.externalId})`);
  }
  return { linked: true, message: parts.join(' ') };
}

type ParsedCatalogItem = {
  catalogId: number;
  catalogName: string;
  areaId: number;
  areaName: string;
  serviceId: number;
  serviceName: string;
};

function stableExternalId(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const positive = Math.abs(hash);
  return positive > 0 ? positive : 1;
}

export function parseCatalogItemRow(
  row: Record<string, unknown>,
): ParsedCatalogItem | null {
  const serviceId = Number(row.id);
  const serviceName = String(row.name ?? row.display_name ?? '').trim();
  if (!Number.isFinite(serviceId) || serviceId <= 0 || !serviceName) {
    return null;
  }

  const catalog = row.catalog as
    | { id?: number; name?: string }
    | null
    | undefined;
  const area = row.area as { id?: number; name?: string } | null | undefined;

  const catalogName = String(catalog?.name ?? '').trim() || 'Catálogo';
  const areaName = String(area?.name ?? '').trim() || 'Área';

  const catalogId =
    catalog?.id != null && Number.isFinite(Number(catalog.id))
      ? Number(catalog.id)
      : stableExternalId(`catalog:${catalogName}`);

  const areaId =
    area?.id != null && Number.isFinite(Number(area.id))
      ? Number(area.id)
      : stableExternalId(`area:${catalogId}:${areaName}`);

  return {
    catalogId,
    catalogName,
    areaId,
    areaName,
    serviceId,
    serviceName,
  };
}

export type CatalogImportResult = {
  specialtyId: string;
  specialtyName: string;
  catalogs: number;
  areas: number;
  services: number;
  removed: number;
};

export async function importCatalogItemsToSpecialty(
  prisma: PrismaClient,
  input: {
    specialtyId: string;
    items: Array<Record<string, unknown>>;
    dryRun?: boolean;
  },
): Promise<CatalogImportResult> {
  const specialty = await prisma.specialty.findUnique({
    where: { id: input.specialtyId },
    select: { id: true, name: true },
  });
  if (!specialty) {
    throw new Error(`Especialidade ${input.specialtyId} não encontrada`);
  }

  const parsed = input.items
    .map(parseCatalogItemRow)
    .filter((row): row is ParsedCatalogItem => row != null);

  const catalogs = new Map<number, { name: string; sortOrder: number }>();
  const areas = new Map<
    string,
    { catalogId: number; areaId: number; name: string; sortOrder: number }
  >();

  for (const row of parsed) {
    if (!catalogs.has(row.catalogId)) {
      catalogs.set(row.catalogId, {
        name: row.catalogName,
        sortOrder: catalogs.size,
      });
    }
    const areaKey = `${row.catalogId}:${row.areaId}`;
    if (!areas.has(areaKey)) {
      areas.set(areaKey, {
        catalogId: row.catalogId,
        areaId: row.areaId,
        name: row.areaName,
        sortOrder: areas.size,
      });
    }
  }

  const result: CatalogImportResult = {
    specialtyId: specialty.id,
    specialtyName: specialty.name,
    catalogs: catalogs.size,
    areas: areas.size,
    services: parsed.length,
    removed: 0,
  };

  if (input.dryRun) return result;

  await prisma.$transaction(async (tx) => {
    const removed = await tx.specialtyClassification.deleteMany({
      where: { specialtyId: specialty.id },
    });
    result.removed = removed.count;

    const catalogIdByLegacy = new Map<number, string>();
    for (const [legacySourceId, meta] of [...catalogs.entries()].sort((a, b) =>
      a[1].name.localeCompare(b[1].name, 'pt-BR'),
    )) {
      const created = await tx.specialtyClassification.create({
        data: {
          specialtyId: specialty.id,
          parentId: null,
          name: meta.name,
          level: 1,
          sortOrder: meta.sortOrder,
          legacySourceId,
          catalogNodeKind: 'catalog',
        },
        select: { id: true },
      });
      catalogIdByLegacy.set(legacySourceId, created.id);
    }

    const areaIdByLegacy = new Map<string, string>();
    for (const area of [...areas.values()].sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR'),
    )) {
      const parentId = catalogIdByLegacy.get(area.catalogId);
      if (!parentId) continue;
      const created = await tx.specialtyClassification.create({
        data: {
          specialtyId: specialty.id,
          parentId,
          name: area.name,
          level: 2,
          sortOrder: area.sortOrder,
          legacySourceId: area.areaId,
          catalogNodeKind: 'area',
        },
        select: { id: true },
      });
      areaIdByLegacy.set(`${area.catalogId}:${area.areaId}`, created.id);
    }

    let serviceSort = 0;
    for (const service of [...parsed].sort((a, b) =>
      a.serviceName.localeCompare(b.serviceName, 'pt-BR'),
    )) {
      const parentId = areaIdByLegacy.get(
        `${service.catalogId}:${service.areaId}`,
      );
      if (!parentId) continue;
      await tx.specialtyClassification.create({
        data: {
          specialtyId: specialty.id,
          parentId,
          name: service.serviceName,
          level: 3,
          sortOrder: serviceSort,
          legacySourceId: service.serviceId,
          catalogNodeKind: 'service',
        },
      });
      serviceSort += 1;
    }
  });

  return result;
}

export type ResponsiblesImportResult = {
  specialtyId: string;
  specialtyName: string;
  deskExternalId: number;
  links: number;
  usersUpdated: number;
  missingPortalUser: number;
};

export async function importDeskResponsiblesToSpecialty(
  prisma: PrismaClient,
  input: {
    specialtyId: string;
    deskExternalId: number;
    technicians: Array<{ email: string; name: string }>;
    dryRun?: boolean;
  },
): Promise<ResponsiblesImportResult> {
  const specialty = await prisma.specialty.findUnique({
    where: { id: input.specialtyId },
    select: { id: true, name: true },
  });
  if (!specialty) {
    throw new Error(`Especialidade ${input.specialtyId} não encontrada`);
  }

  const portalUsers = await prisma.user.findMany({
    where: { deletedAt: null, status: UserStatus.ACTIVE },
    select: { id: true, email: true, name: true, specialtyId: true },
  });
  const usersByEmail = new Map(
    portalUsers.map((u) => [u.email.trim().toLowerCase(), u]),
  );

  const desired = new Map<string, Set<string>>();
  let missingPortalUser = 0;

  for (const tech of input.technicians) {
    const email = tech.email.trim().toLowerCase();
    const user = usersByEmail.get(email);
    if (!user) {
      missingPortalUser += 1;
      continue;
    }
    if (!desired.has(user.id)) desired.set(user.id, new Set());
    desired.get(user.id)!.add(specialty.id);
  }

  const result: ResponsiblesImportResult = {
    specialtyId: specialty.id,
    specialtyName: specialty.name,
    deskExternalId: input.deskExternalId,
    links: input.technicians.length - missingPortalUser,
    usersUpdated: desired.size,
    missingPortalUser,
  };

  if (input.dryRun) return result;

  for (const [userId, specIds] of desired.entries()) {
    const ids = [...specIds];
    await prisma.$transaction(async (tx) => {
      if (ids.length > 0) {
        await tx.userSpecialty.createMany({
          data: ids.map((specialtyId) => ({ userId, specialtyId })),
          skipDuplicates: true,
        });
      }
      const primary = await tx.userSpecialty.findFirst({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: { specialtyId: true },
      });
      await tx.user.update({
        where: { id: userId },
        data: {
          responsible: true,
          ...(primary ? { specialtyId: primary.specialtyId } : {}),
        },
      });
    });
  }

  return result;
}
