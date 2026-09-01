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

const prisma = new PrismaClient();

type ClassificationExport = {
  tifluxExternalId: number | null;
  kind: string | null;
  path: string[];
};

type RuleExport = {
  name: string;
  active: boolean;
  periodicity: TicketAutoOpenPeriodicity;
  nextScheduledDate: string;
  scheduleTime: string;
  deskExternalId: number;
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
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  const next = process.argv[idx + 1];
  if (!next || next.startsWith('--')) return undefined;
  return next;
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

async function resolveClassificationId(
  deskExternalId: number,
  meta: ClassificationExport | null,
): Promise<string | null> {
  if (!meta) return null;

  const specialty = await prisma.specialty.findFirst({
    where: { externalId: deskExternalId, deletedAt: null },
    select: { id: true },
  });
  if (!specialty) return null;

  if (meta.tifluxExternalId != null && meta.kind) {
    const byTiflux = await prisma.specialtyClassification.findFirst({
      where: {
        specialtyId: specialty.id,
        legacySourceId: meta.tifluxExternalId,
        catalogNodeKind: meta.kind,
        active: true,
      },
      select: { id: true },
    });
    if (byTiflux) return byTiflux.id;
  }

  const leaves = await prisma.specialtyClassification.findMany({
    where: {
      specialtyId: specialty.id,
      active: true,
      NOT: {
        children: {
          some: { active: true, level: { lte: 2 } },
        },
      },
    },
    select: { id: true, name: true, parentId: true },
  });

  const leafName = meta.path[meta.path.length - 1]?.trim().toLowerCase();
  if (!leafName) return null;

  const parentName =
    meta.path.length > 1
      ? meta.path[meta.path.length - 2]?.trim().toLowerCase()
      : null;

  for (const leaf of leaves) {
    if (leaf.name.trim().toLowerCase() !== leafName) continue;
    if (!parentName || !leaf.parentId) return leaf.id;

    const parent = await prisma.specialtyClassification.findUnique({
      where: { id: leaf.parentId },
      select: { name: true },
    });
    if (parent?.name.trim().toLowerCase() === parentName) {
      return leaf.id;
    }
  }

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
      name: row.name,
      active: row.active,
      periodicity: row.periodicity,
      nextScheduledDate: ymd(row.nextScheduledDate),
      scheduleTime: row.scheduleTime,
      deskExternalId: row.deskExternalId,
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

  writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`Exportadas ${rules.length} regra(s) → ${outPath}`);
}

async function importRules(
  filePath: string,
  createdByEmail: string,
  dryRun: boolean,
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

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const rule of payload.rules) {
    const classificationId = await resolveClassificationId(
      rule.deskExternalId,
      rule.classification,
    );

    if (rule.classification && !classificationId) {
      console.warn(
        `AVISO: classificação não encontrada para "${rule.name}" (${rule.classification.path.join(' > ')})`,
      );
    }

    const existing = await prisma.ticketAutoOpenRule.findFirst({
      where: { name: rule.name },
      orderBy: { createdAt: 'desc' },
    });

    const data = {
      name: rule.name,
      active: rule.active,
      periodicity: rule.periodicity,
      nextScheduledDate: new Date(`${rule.nextScheduledDate}T00:00:00.000Z`),
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
        console.log(`[dry-run] atualizar: ${rule.name}`);
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
      if (dryRun) {
        console.log(`[dry-run] criar: ${rule.name}`);
        created += 1;
        continue;
      }
      await prisma.ticketAutoOpenRule.create({
        data: {
          id: randomUUID(),
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
  if (skipped > 0) {
    console.log(`Anexos ignorados: ${skipped} (copie manualmente se precisar).`);
  }
}

async function main(): Promise<void> {
  const mode = process.argv[2];
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
    await importRules(file, createdByEmail, hasFlag('--dry-run'));
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
