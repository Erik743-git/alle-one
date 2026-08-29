/**
 * Importação ÚNICA (cutover): copia catálogo de serviços + responsáveis por mesa
 * do TiFlux para tabelas do portal. Depois disso o portal não depende da API.
 *
 * Casa mesa TiFlux ↔ especialidade do portal pelo NOME (não exige external_id).
 * Opcionalmente grava external_id na especialidade (--link-desks).
 *
 * Uso:
 *   cd backend
 *   npx prisma migrate deploy
 *   npx prisma generate
 *   npx ts-node prisma/scripts/import-tiflux-to-portal-once.ts --dry-run
 *   npx ts-node prisma/scripts/import-tiflux-to-portal-once.ts --link-desks
 *   npx ts-node prisma/scripts/import-tiflux-to-portal-once.ts --catalog-only
 *   npx ts-node prisma/scripts/import-tiflux-to-portal-once.ts --responsibles-only
 */
import 'dotenv/config';

import { Prisma, PrismaClient } from '@prisma/client';
import {
  importCatalogItemsToSpecialty,
  importDeskResponsiblesToSpecialty,
  normalizeMatchName,
} from '../../src/modules/admin/portal-tiflux-once.import';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');
const linkDesks = process.argv.includes('--link-desks');
const catalogOnly = process.argv.includes('--catalog-only');
const responsiblesOnly = process.argv.includes('--responsibles-only');
const runCatalog = !responsiblesOnly;
const runResponsibles = !catalogOnly;

async function tifluxFetch(path: string): Promise<unknown> {
  const baseUrl = (process.env.TIFLUX_API_URL ?? 'https://api.tiflux.com/api/v2')
    .replace(/\/+$/, '');
  const token = process.env.TIFLUX_TOKEN?.trim();
  if (!token) {
    throw new Error('TIFLUX_TOKEN não definido no .env');
  }
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`TiFlux ${response.status} ${path}: ${body.slice(0, 300)}`);
  }
  return response.json();
}

async function fetchDesks(): Promise<Array<{ id: number; name: string }>> {
  const all: Array<{ id: number; name: string }> = [];
  let page = 1;
  while (page <= 30) {
    const data = (await tifluxFetch(
      `/desks?active=true&limit=200&offset=${page}`,
    )) as Array<Record<string, unknown>>;
    if (!Array.isArray(data) || data.length === 0) break;
    for (const row of data) {
      const id = Number(row.id);
      const name = String(row.display_name ?? row.name ?? '').trim();
      if (Number.isFinite(id) && id > 0 && name) all.push({ id, name });
    }
    if (data.length < 200) break;
    page += 1;
  }
  return all;
}

async function fetchCatalogItems(
  deskId: number,
): Promise<Array<Record<string, unknown>>> {
  const all: Array<Record<string, unknown>> = [];
  let page = 1;
  while (page <= 30) {
    const data = (await tifluxFetch(
      `/desks/${deskId}/services-catalogs-items?limit=200&offset=${page}`,
    )) as Array<Record<string, unknown>>;
    if (!Array.isArray(data) || data.length === 0) break;
    all.push(...data);
    if (data.length < 200) break;
    page += 1;
  }
  return all;
}

async function fetchTechnicalUsers(
  deskId: number,
): Promise<Array<{ email: string; name: string }>> {
  const all: Array<{ email: string; name: string }> = [];
  let page = 1;
  while (page <= 30) {
    const data = (await tifluxFetch(
      `/technical-users?desk_id=${deskId}&limit=200&offset=${page}`,
    )) as Array<Record<string, unknown>>;
    if (!Array.isArray(data) || data.length === 0) break;
    for (const row of data) {
      const email = String(row.email ?? '')
        .trim()
        .toLowerCase();
      const name = String(row.name ?? '').trim();
      if (email.includes('@') && name) all.push({ email, name });
    }
    if (data.length < 200) break;
    page += 1;
  }
  return all;
}

function assertPrismaClientUpToDate(): void {
  const model = Prisma.dmmf.datamodel.models.find(
    (m) => m.name === 'SpecialtyClassification',
  );
  const hasLegacyField = model?.fields.some((f) => f.name === 'legacySourceId');
  if (!hasLegacyField) {
    throw new Error(
      'Prisma Client desatualizado (falta legacySourceId em SpecialtyClassification). ' +
        'Rode: npx prisma generate',
    );
  }
}

async function main() {
  assertPrismaClientUpToDate();
  console.log(
    `Importação única TiFlux → portal${dryRun ? ' (dry-run)' : ''}`,
  );

  const [desks, specialties] = await Promise.all([
    fetchDesks(),
    prisma.specialty.findMany({
      where: { deletedAt: null, active: true },
      select: { id: true, name: true, externalId: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const specialtyByName = new Map(
    specialties.map((s) => [normalizeMatchName(s.name), s]),
  );

  let catalogDesks = 0;
  let responsibleDesks = 0;

  for (const desk of desks) {
    const specialty = specialtyByName.get(normalizeMatchName(desk.name));
    if (!specialty) {
      console.warn(
        `[skip] Mesa TiFlux "${desk.name}" (#${desk.id}) — sem especialidade com mesmo nome no portal`,
      );
      continue;
    }

    console.log(`\n=== ${desk.name} (TiFlux #${desk.id}) → ${specialty.name} ===`);

    if (linkDesks && !dryRun && specialty.externalId !== desk.id) {
      await prisma.specialty.update({
        where: { id: specialty.id },
        data: { externalId: desk.id },
      });
      console.log(`  external_id da especialidade → ${desk.id}`);
    }

    if (runCatalog) {
      const items = await fetchCatalogItems(desk.id);
      const catalogResult = await importCatalogItemsToSpecialty(prisma, {
        specialtyId: specialty.id,
        items,
        dryRun,
      });
      catalogDesks += 1;
      console.log(
        `  Catálogo: ${catalogResult.catalogs} catálogo(s), ${catalogResult.areas} área(s), ${catalogResult.services} serviço(s)${
          dryRun ? '' : ` (${catalogResult.removed} nó(s) antigos removidos)`
        }`,
      );
    }

    if (runResponsibles) {
      const technicians = await fetchTechnicalUsers(desk.id);
      const respResult = await importDeskResponsiblesToSpecialty(prisma, {
        specialtyId: specialty.id,
        deskExternalId: desk.id,
        technicians,
        dryRun,
      });
      responsibleDesks += 1;
      console.log(
        `  Responsáveis: ${respResult.usersUpdated} usuário(s), ${respResult.links} vínculo(s), ${respResult.missingPortalUser} técnico(s) sem usuário portal`,
      );
    }
  }

  console.log(
    `\nConcluído. Mesas processadas: catálogo=${catalogDesks}, responsáveis=${responsibleDesks}.`,
  );
  console.log(
    'Os dados ficam no portal — não é preciso rodar de novo nem manter sync com TiFlux.',
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
