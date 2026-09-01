/**
 * Exporta / importa regras de abertura automática entre ambientes (ex.: teste → produção).
 *
 * Exportar do teste:
 *   cd backend
 *   npx ts-node prisma/scripts/sync-ticket-auto-open-rules.ts export --out=/tmp/ticket-auto-open-rules.json
 *
 * Importar em produção (dry-run):
 *   cd backend
 *   npx ts-node prisma/scripts/sync-ticket-auto-open-rules.ts import \
 *     --file=/tmp/ticket-auto-open-rules.json \
 *     --created-by-email=erik.manarin@alletecnologia.com \
 *     --dry-run
 *
 * Importar de fato:
 *   npx ts-node prisma/scripts/sync-ticket-auto-open-rules.ts import \
 *     --file=/tmp/ticket-auto-open-rules.json \
 *     --created-by-email=erik.manarin@alletecnologia.com
 */
import 'dotenv/config';
import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import {
  PrismaClient,
  TicketAutoOpenPeriodicity,
} from '@prisma/client';
import { normalizeDeskName } from '../../src/modules/tickets/tiflux-portal-desk.config';

const prisma = new PrismaClient();

type ClassificationExport = {
  tifluxExternalId: number | null;
  kind: string | null;
  path: string[];
};

type RuleExport = {
  sourceId?: string;
  name: string;
  active: boolean;
  periodicity: TicketAutoOpenPeriodicity;
  nextScheduledDate: string;
  scheduleTime: string;
  deskExternalId: number;
  deskName: string | null;
  clientExternalId: number;
  responsibleExternalId: number | null;
  priorityExternalId: number | null;
  servicesCatalogsItemId: number | null;
  classification: ClassificationExport | null;
  title: string;
  description: string;
  requestorName: string;
  requestorEmail: string;
  requestorTelephone: string | null;
  requestorExternalId: number | null;
  externalGmudRef: string | null;
  ccEmails: string[];
  parentTicketNumber: number | null;
  attachmentNames: string[];
};

type ExportPayload = {
  exportedAt: string;
  rules: RuleExport[];
};

function argValue(flag: string): string | undefined {
  const prefix = `${flag}=`;
  for (let i = 0; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
    if (arg.startsWith(prefix)) {
      const value = arg.slice(prefix.length);
      if (value) return value;
    }
    if (arg === flag) {
      const next = process.argv[i + 1];
      if (next && !next.startsWith('--')) return next;
    }
  }
  return undefined;
}

function getMode(): 'export' | 'import' | null {
  if (process.argv.includes('export')) return 'export';
  if (process.argv.includes('import')) return 'import';
  return null;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function buildClassificationExport(
  classificationId: string | null,
): Promise<ClassificationExport | null> {
  if (!classificationId) return null;

  const path: string[] = [];
  let currentId: string | null = classificationId;
  let tifluxExternalId: number | null = null;
  let kind: string | null = null;

  while (currentId) {
    const row = await prisma.specialtyClassification.findUnique({
      where: { id: currentId },
      select: {
        id: true,
        name: true,
        parentId: true,
        legacySourceId: true,
        catalogNodeKind: true,
      },
    });
    if (!row) break;
    path.unshift(row.name);
    if (!tifluxExternalId && row.legacySourceId != null) {
      tifluxExternalId = row.legacySourceId;
    }
    if (!kind && row.catalogNodeKind) {
      kind = row.catalogNodeKind;
    }
    currentId = row.parentId;
  }

  if (path.length === 0) return null;
  return { tifluxExternalId, kind, path };
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

function normalizePath(parts: string[]): string {
  return parts.map(normalizeToken).join(' > ');
}

async function resolveDeskName(deskExternalId: number): Promise<string | null> {
  const specialty = await prisma.specialty.findFirst({
    where: { externalId: deskExternalId, deletedAt: null },
    select: { name: true },
  });
  if (specialty?.name) return specialty.name;

  const rows = await prisma.$queryRaw<Array<{ desk_name: string }>>`
    SELECT DISTINCT trim(t.desk_name) AS desk_name
    FROM tiflux.tickets t
    WHERE t.desk_external_id = ${deskExternalId}
      AND t.desk_name IS NOT NULL
      AND trim(t.desk_name) <> ''
    LIMIT 1
  `;
  return rows[0]?.desk_name ?? null;
}

async function findPortalDesk(
  deskExternalId: number,
  deskName?: string | null,
): Promise<{ id: string; name: string } | null> {
  const candidates: Array<{ id: string; name: string }> = [];

  const byExternalId = await prisma.specialty.findFirst({
    where: { externalId: deskExternalId, deletedAt: null, active: true },
    select: { id: true, name: true },
  });
  if (byExternalId) candidates.push(byExternalId);

  const normalizedTarget = normalizeDeskName(deskName);
  if (normalizedTarget) {
    const portalDesks = await prisma.specialty.findMany({
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
      count: await prisma.specialtyClassification.count({
        where: { specialtyId: desk.id, active: true },
      }),
    })),
  );
  const withClassifications = withCounts.filter((row) => row.count > 0);
  if (withClassifications.length > 0) return withClassifications[0].desk;
  return candidates[0].desk;
}

type PathIndex = {
  byFullPath: Map<string, string>;
  byLeafName: Map<string, string[]>;
};

async function buildPathIndex(specialtyId: string): Promise<PathIndex> {
  const rows = await prisma.specialtyClassification.findMany({
    where: { specialtyId, active: true },
    select: { id: true, name: true, parentId: true },
  });
  if (rows.length === 0) {
    return { byFullPath: new Map(), byLeafName: new Map() };
  }

  const byId = new Map(rows.map((row) => [row.id, row]));
  const childIds = new Set<string>();
  for (const row of rows) {
    if (row.parentId) childIds.add(row.parentId);
  }

  const byFullPath = new Map<string, string>();
  const byLeafName = new Map<string, string[]>();

  for (const row of rows) {
    if (childIds.has(row.id)) continue;

    const parts: string[] = [];
    let currentId: string | null = row.id;
    while (currentId) {
      const node = byId.get(currentId);
      if (!node) break;
      parts.unshift(node.name);
      currentId = node.parentId;
    }

    byFullPath.set(normalizePath(parts), row.id);

    const leaf = normalizeToken(parts[parts.length - 1] ?? '');
    if (!leaf) continue;
    const list = byLeafName.get(leaf) ?? [];
    list.push(row.id);
    byLeafName.set(leaf, list);
  }

  return { byFullPath, byLeafName };
}

async function resolveClassificationId(
  deskExternalId: number,
  deskName: string | null,
  meta: ClassificationExport | null,
  servicesCatalogsItemId: number | null,
  pathIndexCache: Map<string, PathIndex>,
): Promise<string | null> {
  if (!meta && servicesCatalogsItemId == null) return null;

  const portalDesk = await findPortalDesk(deskExternalId, deskName);
  if (!portalDesk) return null;

  let pathIndex = pathIndexCache.get(portalDesk.id);
  if (!pathIndex) {
    pathIndex = await buildPathIndex(portalDesk.id);
    pathIndexCache.set(portalDesk.id, pathIndex);
  }

  if (servicesCatalogsItemId != null) {
    const byServiceItem = await prisma.specialtyClassification.findFirst({
      where: {
        specialtyId: portalDesk.id,
        legacySourceId: servicesCatalogsItemId,
        active: true,
      },
      select: { id: true },
      orderBy: { level: 'desc' },
    });
    if (byServiceItem) return byServiceItem.id;
  }

  if (!meta) return null;

  if (meta.tifluxExternalId != null && meta.kind) {
    const byTiflux = await prisma.specialtyClassification.findFirst({
      where: {
        specialtyId: portalDesk.id,
        legacySourceId: meta.tifluxExternalId,
        catalogNodeKind: meta.kind,
        active: true,
      },
      select: { id: true },
    });
    if (byTiflux) return byTiflux.id;
  }

  const fullPath = normalizePath(meta.path);
  const byFull = pathIndex.byFullPath.get(fullPath);
  if (byFull) return byFull;

  if (meta.path.length >= 2) {
    const suffix = normalizePath(meta.path.slice(-2));
    const bySuffix = pathIndex.byFullPath.get(suffix);
    if (bySuffix) return bySuffix;
  }

  const leafName = normalizeToken(meta.path[meta.path.length - 1] ?? '');
  const leafCandidates = pathIndex.byLeafName.get(leafName) ?? [];
  if (leafCandidates.length === 1) return leafCandidates[0];

  return null;
}

async function exportRules(outPath: string): Promise<void> {
  const rows = await prisma.ticketAutoOpenRule.findMany({
    where: { deletedAt: null },
    include: {
      attachments: {
        include: {
          file: {
            select: { originalName: true },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  const rules: RuleExport[] = [];
  for (const row of rows) {
    rules.push({
      sourceId: row.id,
      name: row.name,
      active: row.active,
      periodicity: row.periodicity,
      nextScheduledDate: ymd(row.nextScheduledDate),
      scheduleTime: row.scheduleTime,
      deskExternalId: row.deskExternalId,
      deskName: await resolveDeskName(row.deskExternalId),
      clientExternalId: row.clientExternalId,
      responsibleExternalId: row.responsibleExternalId,
      priorityExternalId: row.priorityExternalId,
      servicesCatalogsItemId: row.servicesCatalogsItemId,
      classification: await buildClassificationExport(row.classificationId),
      title: row.title,
      description: row.description,
      requestorName: row.requestorName,
      requestorEmail: row.requestorEmail,
      requestorTelephone: row.requestorTelephone,
      requestorExternalId: row.requestorExternalId,
      externalGmudRef: row.externalGmudRef,
      ccEmails: row.ccEmails,
      parentTicketNumber: row.parentTicketNumber,
      attachmentNames: row.attachments.map((a) => a.file.originalName),
    });
  }

  const payload: ExportPayload = {
    exportedAt: new Date().toISOString(),
    rules,
  };

  const duplicateNames = rules
    .map((r) => r.name)
    .reduce((acc, name) => acc.set(name, (acc.get(name) ?? 0) + 1), new Map<string, number>());
  const dupCount = [...duplicateNames.values()].filter((c) => c > 1).length;
  if (dupCount > 0) {
    console.warn(
      `AVISO: ${dupCount} nome(s) repetido(s) no teste — import usa sourceId para não perder regras.`,
    );
  }

  writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`Exportadas ${rules.length} regra(s) → ${outPath}`);
}

function ruleNextDate(rule: RuleExport): Date {
  return new Date(`${rule.nextScheduledDate}T00:00:00.000Z`);
}

async function findExistingRule(
  rule: RuleExport,
): Promise<{ id: string; lastRunAt: Date | null; lastTicketNumber: number | null } | null> {
  const sourceId = rule.sourceId?.trim();
  if (sourceId) {
    const byId = await prisma.ticketAutoOpenRule.findUnique({
      where: { id: sourceId },
      select: { id: true, lastRunAt: true, lastTicketNumber: true },
    });
    if (byId) return byId;
  }

  return prisma.ticketAutoOpenRule.findFirst({
    where: {
      name: rule.name,
      clientExternalId: rule.clientExternalId,
      deskExternalId: rule.deskExternalId,
      scheduleTime: rule.scheduleTime,
      periodicity: rule.periodicity,
      nextScheduledDate: ruleNextDate(rule),
      deletedAt: null,
    },
    select: { id: true, lastRunAt: true, lastTicketNumber: true },
  });
}

async function importRules(
  filePath: string,
  createdByEmail: string,
  dryRun: boolean,
  fresh: boolean,
): Promise<void> {
  const raw = readFileSync(filePath, 'utf8');
  const payload = JSON.parse(raw) as ExportPayload;

  const creator = await prisma.user.findFirst({
    where: {
      email: { equals: createdByEmail, mode: 'insensitive' },
      deletedAt: null,
      status: 'ACTIVE',
    },
    select: { id: true, name: true, email: true },
  });
  if (!creator) {
    throw new Error(`Usuário criador não encontrado: ${createdByEmail}`);
  }

  console.log(
    `Importando ${payload.rules.length} regra(s) de ${payload.exportedAt} (criador: ${creator.email})`,
  );
  if (dryRun) console.log('Modo dry-run — nenhuma alteração será gravada.');
  if (fresh) {
    console.log(
      'Modo --fresh: regras ativas em prod serão desativadas (soft-delete) antes do import.',
    );
    if (!dryRun) {
      const purged = await prisma.ticketAutoOpenRule.updateMany({
        where: { deletedAt: null },
        data: { deletedAt: new Date() },
      });
      console.log(`Soft-delete de ${purged.count} regra(s) existente(s) em prod.`);
    }
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let classificationOk = 0;
  let classificationMissing = 0;
  const pathIndexCache = new Map<string, PathIndex>();
  const deskNameCache = new Map<number, string | null>();

  for (const rule of payload.rules) {
    let deskName = rule.deskName ?? null;
    if (!deskName) {
      if (!deskNameCache.has(rule.deskExternalId)) {
        deskNameCache.set(
          rule.deskExternalId,
          await resolveDeskName(rule.deskExternalId),
        );
      }
      deskName = deskNameCache.get(rule.deskExternalId) ?? null;
    }

    const classificationId = await resolveClassificationId(
      rule.deskExternalId,
      deskName,
      rule.classification,
      rule.servicesCatalogsItemId,
      pathIndexCache,
    );

    if (rule.classification) {
      if (classificationId) classificationOk += 1;
      else {
        classificationMissing += 1;
        console.warn(
          `AVISO: classificação não encontrada para "${rule.name}" (${rule.classification.path.join(' > ')})`,
        );
      }
    }

    const existing = await findExistingRule(rule);

    const data = {
      name: rule.name,
      active: rule.active,
      periodicity: rule.periodicity,
      nextScheduledDate: ruleNextDate(rule),
      scheduleTime: rule.scheduleTime,
      deskExternalId: rule.deskExternalId,
      clientExternalId: rule.clientExternalId,
      responsibleExternalId: rule.responsibleExternalId,
      priorityExternalId: rule.priorityExternalId,
      servicesCatalogsItemId: rule.servicesCatalogsItemId,
      classificationId,
      title: rule.title,
      description: rule.description,
      requestorName: rule.requestorName,
      requestorEmail: rule.requestorEmail,
      requestorTelephone: rule.requestorTelephone,
      requestorExternalId: rule.requestorExternalId,
      externalGmudRef: rule.externalGmudRef,
      ccEmails: rule.ccEmails,
      parentTicketNumber: rule.parentTicketNumber,
      deletedAt: null,
    };

    if (existing) {
      if (dryRun) {
        console.log(`[dry-run] atualizar: ${rule.name} (${rule.sourceId ?? existing.id})`);
        updated += 1;
        continue;
      }
      await prisma.ticketAutoOpenRule.update({
        where: { id: existing.id },
        data: {
          ...data,
          lastRunAt: existing.lastRunAt,
          lastTicketNumber: existing.lastTicketNumber,
        },
      });
      console.log(`Atualizada: ${rule.name}`);
      updated += 1;
    } else {
      const newId = rule.sourceId?.trim() || randomUUID();
      if (dryRun) {
        console.log(`[dry-run] criar: ${rule.name} (${newId})`);
        created += 1;
        continue;
      }
      await prisma.ticketAutoOpenRule.create({
        data: {
          id: newId,
          ...data,
          createdBy: creator.id,
          lastRunAt: null,
          lastTicketNumber: null,
        },
      });
      console.log(`Criada: ${rule.name}`);
      created += 1;
    }

    if (rule.attachmentNames.length > 0) {
      console.warn(
        `  Anexos não migrados (${rule.attachmentNames.join(', ')}) — reanexe manualmente se necessário.`,
      );
      skipped += rule.attachmentNames.length;
    }
  }

  console.log('');
  console.log(`Resumo: ${created} criada(s), ${updated} atualizada(s).`);
  const activeInDb = await prisma.ticketAutoOpenRule.count({
    where: { deletedAt: null },
  });
  if (!dryRun) {
    console.log(`Total ativo em prod após import: ${activeInDb}`);
    if (activeInDb !== payload.rules.length) {
      console.warn(
        `AVISO: esperado ${payload.rules.length} regra(s), encontrado ${activeInDb}. Rode com --fresh se precisar reimportar tudo.`,
      );
    }
  }
  console.log(
    `Classificações: ${classificationOk} mapeada(s), ${classificationMissing} sem correspondência em prod.`,
  );
  if (skipped > 0) {
    console.log(`Anexos ignorados: ${skipped} (copie manualmente se precisar).`);
  }
}

async function main(): Promise<void> {
  const mode = getMode();
  if (mode === 'export') {
    const out = argValue('--out');
    if (!out) {
      throw new Error('Use: export --out=/caminho/arquivo.json');
    }
    await exportRules(out);
    return;
  }

  if (mode === 'import') {
    const file = argValue('--file');
    const createdByEmail =
      argValue('--created-by-email') ?? 'erik.manarin@alletecnologia.com';
    if (!file) {
      throw new Error(
        'Use: import --file=/caminho/arquivo.json [--created-by-email=...] [--dry-run]',
      );
    }
    await importRules(file, createdByEmail, hasFlag('--dry-run'), hasFlag('--fresh'));
    return;
  }

  throw new Error(
    'Modo inválido. Use "export" ou "import". Rode sem argumentos para ver o cabeçalho do arquivo.',
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
