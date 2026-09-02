/**
 * Exporta / importa árvores de classificação (specialty_classifications) entre ambientes.
 *
 * Exportar do TESTE:
 *   cd /home/alleone/teste/backend
 *   npx ts-node prisma/scripts/sync-specialty-classifications.ts export \
 *     --out=/tmp/specialty-classifications.json
 *
 * Importar em PRODUÇÃO (dry-run):
 *   cd /home/alleone/producao/backend
 *   npx ts-node prisma/scripts/sync-specialty-classifications.ts import \
 *     --file=/tmp/specialty-classifications.json \
 *     --overwrite \
 *     --dry-run
 *
 * Importar de fato (sobrescreve as classificações das especialidades exportadas):
 *   npx ts-node prisma/scripts/sync-specialty-classifications.ts import \
 *     --file=/tmp/specialty-classifications.json \
 *     --overwrite
 */
import 'dotenv/config';
import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type ClassificationExport = {
  sourceId: string;
  parentSourceId: string | null;
  name: string;
  level: number;
  sortOrder: number;
  active: boolean;
  legacySourceId: number | null;
  catalogNodeKind: string | null;
};

type SpecialtyExport = {
  specialtySourceId: string;
  externalId: number | null;
  name: string;
  classifications: ClassificationExport[];
};

type ExportPayload = {
  exportedAt: string;
  specialties: SpecialtyExport[];
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

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function getMode(): 'export' | 'import' | null {
  if (process.argv.includes('export')) return 'export';
  if (process.argv.includes('import')) return 'import';
  return null;
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

function buildPathKey(
  rows: Array<{ sourceId: string; parentSourceId: string | null; name: string }>,
  sourceId: string,
): string {
  const byId = new Map(rows.map((row) => [row.sourceId, row]));
  const parts: string[] = [];
  let currentId: string | null = sourceId;
  while (currentId) {
    const row = byId.get(currentId);
    if (!row) break;
    parts.unshift(normalizeToken(row.name));
    currentId = row.parentSourceId;
  }
  return parts.join(' > ');
}

function stableRowKey(row: ClassificationExport, pathKey: string): string {
  if (row.legacySourceId != null && row.catalogNodeKind) {
    return `tiflux:${row.catalogNodeKind}:${row.legacySourceId}`;
  }
  return `path:${pathKey}`;
}

async function exportClassifications(outPath: string): Promise<void> {
  const specialties = await prisma.specialty.findMany({
    where: { deletedAt: null },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, externalId: true },
  });

  const payload: ExportPayload = {
    exportedAt: new Date().toISOString(),
    specialties: [],
  };

  for (const specialty of specialties) {
    const rows = await prisma.specialtyClassification.findMany({
      where: { specialtyId: specialty.id },
      orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        parentId: true,
        name: true,
        level: true,
        sortOrder: true,
        active: true,
        legacySourceId: true,
        catalogNodeKind: true,
      },
    });

    if (rows.length === 0) continue;

    payload.specialties.push({
      specialtySourceId: specialty.id,
      externalId: specialty.externalId,
      name: specialty.name,
      classifications: rows.map((row) => ({
        sourceId: row.id,
        parentSourceId: row.parentId,
        name: row.name,
        level: row.level,
        sortOrder: row.sortOrder,
        active: row.active,
        legacySourceId: row.legacySourceId,
        catalogNodeKind: row.catalogNodeKind,
      })),
    });
  }

  writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
  const total = payload.specialties.reduce(
    (sum, item) => sum + item.classifications.length,
    0,
  );
  console.log(
    `Exportadas ${total} classificação(ões) em ${payload.specialties.length} especialidade(s) → ${outPath}`,
  );
}

async function resolveTargetSpecialty(
  item: SpecialtyExport,
): Promise<{ id: string; name: string } | null> {
  if (item.externalId != null) {
    const byExternal = await prisma.specialty.findFirst({
      where: { externalId: item.externalId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (byExternal) return byExternal;
  }

  const byName = await prisma.specialty.findFirst({
    where: {
      name: { equals: item.name, mode: 'insensitive' },
      deletedAt: null,
    },
    select: { id: true, name: true },
  });
  return byName;
}

async function captureClassificationReferences(classificationIds: string[]) {
  if (classificationIds.length === 0) {
    return {
      tickets: [] as Array<{ ticketNumber: number; classificationId: string }>,
      contracts: [] as Array<{ id: string; classificationId: string | null }>,
      rules: [] as Array<{ id: string; classificationId: string | null }>,
    };
  }

  const [tickets, contracts, rules] = await Promise.all([
    prisma.portalTicket.findMany({
      where: { classificationId: { in: classificationIds } },
      select: { ticketNumber: true, classificationId: true },
    }),
    prisma.contract.findMany({
      where: { classificationId: { in: classificationIds } },
      select: { id: true, classificationId: true },
    }),
    prisma.ticketAutoOpenRule.findMany({
      where: { classificationId: { in: classificationIds } },
      select: { id: true, classificationId: true },
    }),
  ]);

  return { tickets, contracts, rules };
}

async function restoreClassificationReferences(params: {
  tickets: Array<{ ticketNumber: number; classificationId: string }>;
  contracts: Array<{ id: string; classificationId: string | null }>;
  rules: Array<{ id: string; classificationId: string | null }>;
  oldToNew: Map<string, string>;
  dryRun: boolean;
}): Promise<{ tickets: number; contracts: number; rules: number }> {
  let tickets = 0;
  let contracts = 0;
  let rules = 0;

  for (const row of params.tickets) {
    if (!row.classificationId) continue;
    const nextId = params.oldToNew.get(row.classificationId);
    if (!nextId || nextId === row.classificationId) continue;
    tickets += 1;
    if (!params.dryRun) {
      await prisma.portalTicket.update({
        where: { ticketNumber: row.ticketNumber },
        data: { classificationId: nextId },
      });
    }
  }

  for (const row of params.contracts) {
    if (!row.classificationId) continue;
    const nextId = params.oldToNew.get(row.classificationId);
    if (!nextId || nextId === row.classificationId) continue;
    contracts += 1;
    if (!params.dryRun) {
      await prisma.contract.update({
        where: { id: row.id },
        data: { classificationId: nextId },
      });
    }
  }

  for (const row of params.rules) {
    if (!row.classificationId) continue;
    const nextId = params.oldToNew.get(row.classificationId);
    if (!nextId || nextId === row.classificationId) continue;
    rules += 1;
    if (!params.dryRun) {
      await prisma.ticketAutoOpenRule.update({
        where: { id: row.id },
        data: { classificationId: nextId },
      });
    }
  }

  return { tickets, contracts, rules };
}

async function importClassifications(
  filePath: string,
  dryRun: boolean,
  overwrite: boolean,
): Promise<void> {
  if (!overwrite) {
    throw new Error('Use --overwrite para substituir classificações existentes.');
  }

  const payload = JSON.parse(readFileSync(filePath, 'utf8')) as ExportPayload;
  console.log(
    `Importando export de ${payload.exportedAt} (${payload.specialties.length} especialidade(s))`,
  );
  if (dryRun) console.log('Modo dry-run — nenhuma alteração será gravada.');

  let importedSpecialties = 0;
  let importedRows = 0;
  let skippedSpecialties = 0;
  let remappedTickets = 0;
  let remappedContracts = 0;
  let remappedRules = 0;

  for (const item of payload.specialties) {
    const targetSpecialty = await resolveTargetSpecialty(item);
    if (!targetSpecialty) {
      skippedSpecialties += 1;
      console.warn(
        `AVISO: especialidade não encontrada em prod (${item.name}, externalId=${item.externalId ?? '—'})`,
      );
      continue;
    }

    const existingRows = await prisma.specialtyClassification.findMany({
      where: { specialtyId: targetSpecialty.id },
      select: { id: true, name: true, parentId: true, legacySourceId: true, catalogNodeKind: true },
    });

    const existingPathRows = existingRows.map((row) => ({
      sourceId: row.id,
      parentSourceId: row.parentId,
      name: row.name,
    }));

    const oldKeyToId = new Map<string, string>();
    for (const row of existingRows) {
      const pathKey = buildPathKey(existingPathRows, row.id);
      oldKeyToId.set(
        stableRowKey(
          {
            sourceId: row.id,
            parentSourceId: row.parentId,
            name: row.name,
            level: 0,
            sortOrder: 0,
            active: true,
            legacySourceId: row.legacySourceId,
            catalogNodeKind: row.catalogNodeKind,
          },
          pathKey,
        ),
        row.id,
      );
    }

    const sourcePathRows = item.classifications.map((row) => ({
      sourceId: row.sourceId,
      parentSourceId: row.parentSourceId,
      name: row.name,
    }));

    const newKeyToId = new Map<string, string>();
    for (const row of item.classifications) {
      const pathKey = buildPathKey(sourcePathRows, row.sourceId);
      newKeyToId.set(stableRowKey(row, pathKey), randomUUID());
    }

    const oldToNew = new Map<string, string>();
    for (const [key, oldId] of oldKeyToId) {
      const newId = newKeyToId.get(key);
      if (newId) oldToNew.set(oldId, newId);
    }

    console.log(
      `\n${targetSpecialty.name}: ${item.classifications.length} classificação(ões)`,
    );

    if (dryRun) {
      importedSpecialties += 1;
      importedRows += item.classifications.length;
      const refs = await captureClassificationReferences([...oldKeyToId.values()]);
      const remap = await restoreClassificationReferences({
        ...refs,
        oldToNew,
        dryRun: true,
      });
      remappedTickets += remap.tickets;
      remappedContracts += remap.contracts;
      remappedRules += remap.rules;
      console.log(
        `[dry-run] substituiria ${existingRows.length} → ${item.classifications.length}; remapearia tickets=${remap.tickets}, contratos=${remap.contracts}, regras=${remap.rules}`,
      );
      continue;
    }

    const refs = await captureClassificationReferences([...oldKeyToId.values()]);

    await prisma.$transaction(async (tx) => {
      const roots = await tx.specialtyClassification.findMany({
        where: { specialtyId: targetSpecialty.id, parentId: null },
        select: { id: true },
      });
      for (const root of roots) {
        await tx.specialtyClassification.delete({ where: { id: root.id } });
      }

      const sourceIdToNewId = new Map<string, string>();
      for (const row of item.classifications) {
        const pathKey = buildPathKey(sourcePathRows, row.sourceId);
        sourceIdToNewId.set(row.sourceId, newKeyToId.get(stableRowKey(row, pathKey))!);
      }

      const sorted = [...item.classifications].sort((a, b) => a.level - b.level);
      for (const row of sorted) {
        const id = sourceIdToNewId.get(row.sourceId)!;
        const parentId = row.parentSourceId
          ? sourceIdToNewId.get(row.parentSourceId) ?? null
          : null;

        await tx.specialtyClassification.create({
          data: {
            id,
            specialtyId: targetSpecialty.id,
            parentId,
            name: row.name,
            level: row.level,
            sortOrder: row.sortOrder,
            active: row.active,
            legacySourceId: row.legacySourceId,
            catalogNodeKind: row.catalogNodeKind,
          },
        });
      }
    });

    const remap = await restoreClassificationReferences({
      ...refs,
      oldToNew,
      dryRun: false,
    });
    remappedTickets += remap.tickets;
    remappedContracts += remap.contracts;
    remappedRules += remap.rules;
    importedSpecialties += 1;
    importedRows += item.classifications.length;
    console.log(
      `OK — importada; referências remapeadas: tickets=${remap.tickets}, contratos=${remap.contracts}, regras=${remap.rules}`,
    );
  }

  console.log('');
  console.log(
    `Resumo: ${importedSpecialties} especialidade(s), ${importedRows} classificação(ões) importada(s).`,
  );
  console.log(
    `Referências remapeadas: tickets=${remappedTickets}, contratos=${remappedContracts}, regras=${remappedRules}.`,
  );
  if (skippedSpecialties > 0) {
    console.warn(`Especialidades ignoradas: ${skippedSpecialties}`);
  }
}

async function main(): Promise<void> {
  const mode = getMode();
  if (mode === 'export') {
    const out = argValue('--out');
    if (!out) throw new Error('Use: export --out=/caminho/arquivo.json');
    await exportClassifications(out);
    return;
  }

  if (mode === 'import') {
    const file = argValue('--file');
    if (!file) throw new Error('Use: import --file=/caminho/arquivo.json');
    await importClassifications(file, hasFlag('--dry-run'), hasFlag('--overwrite'));
    return;
  }

  throw new Error('Use: export --out=... | import --file=... --overwrite');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
