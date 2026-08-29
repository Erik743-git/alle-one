import 'dotenv/config';

/**
 * Sincroniza vínculos usuário ↔ especialidade a partir do TiFlux
 * (GET /technical-users?desk_id= por mesa).
 *
 * Pré-requisitos:
 * - specialties.external_id = desk.id do TiFlux
 * - TIFLUX_TOKEN e TIFLUX_API_URL no .env
 *
 * Uso:
 *   cd backend && npx ts-node prisma/scripts/sync-user-specialties-from-tiflux.ts
 *   cd backend && npx ts-node prisma/scripts/sync-user-specialties-from-tiflux.ts --dry-run
 */
import { PrismaClient, UserRole, UserStatus } from '@prisma/client';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.includes('@') ? email : null;
}

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
      if (Number.isFinite(id) && id > 0 && name) {
        all.push({ id, name });
      }
    }
    if (data.length < 200) break;
    page += 1;
  }
  return all;
}

async function fetchTechnicalUsersForDesk(
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
      const email = normalizeEmail(row.email);
      const name = String(row.name ?? '').trim();
      if (!email || !name) continue;
      all.push({ email, name });
    }
    if (data.length < 200) break;
    page += 1;
  }
  return all;
}

async function main() {
  console.log(
    `Sync user_specialties ← TiFlux technical-users${dryRun ? ' (dry-run)' : ''}`,
  );

  const portalUsers = await prisma.user.findMany({
    where: {
      deletedAt: null,
      status: UserStatus.ACTIVE,
      role: { in: [UserRole.ADMIN, UserRole.COLLABORATOR, UserRole.PJ] },
    },
    select: { id: true, email: true, name: true, specialtyId: true },
  });
  const usersByEmail = new Map(
    portalUsers.map((u) => [u.email.trim().toLowerCase(), u]),
  );
  console.log(`Usuários portal elegíveis: ${portalUsers.length}`);

  const specialties = await prisma.specialty.findMany({
    where: { deletedAt: null, active: true, externalId: { not: null } },
    select: { id: true, name: true, externalId: true },
  });
  const specialtyByDeskId = new Map(
    specialties
      .filter((s) => s.externalId != null)
      .map((s) => [s.externalId as number, s]),
  );
  console.log(`Especialidades com external_id: ${specialties.length}`);

  const desks = await fetchDesks();
  console.log(`Mesas TiFlux ativas: ${desks.length}`);

  const desired = new Map<string, Set<string>>();
  let missingSpecialty = 0;
  let missingUser = 0;
  let links = 0;

  for (const desk of desks) {
    const specialty = specialtyByDeskId.get(desk.id);
    if (!specialty) {
      missingSpecialty += 1;
      console.warn(
        `  [skip] Mesa TiFlux #${desk.id} "${desk.name}" sem specialty.external_id no portal`,
      );
      continue;
    }

    const technicians = await fetchTechnicalUsersForDesk(desk.id);
    console.log(
      `  Mesa #${desk.id} "${desk.name}" → ${technicians.length} técnico(s)`,
    );

    for (const tech of technicians) {
      const user = usersByEmail.get(tech.email);
      if (!user) {
        missingUser += 1;
        console.warn(`    [sem usuário portal] ${tech.name} <${tech.email}>`);
        continue;
      }
      if (!desired.has(user.id)) desired.set(user.id, new Set());
      desired.get(user.id)!.add(specialty.id);
      links += 1;
    }
  }

  console.log(`Vínculos desejados: ${links} (${desired.size} usuário(s))`);

  if (dryRun) {
    for (const [userId, specIds] of desired.entries()) {
      const user = portalUsers.find((u) => u.id === userId);
      const names = [...specIds]
        .map((id) => specialties.find((s) => s.id === id)?.name ?? id)
        .join(', ');
      console.log(`  ${user?.name ?? userId}: ${names}`);
    }
    return;
  }

  for (const [userId, specIds] of desired.entries()) {
    const ids = [...specIds];
    await prisma.$transaction(async (tx) => {
      await tx.userSpecialty.deleteMany({ where: { userId } });
      if (ids.length > 0) {
        await tx.userSpecialty.createMany({
          data: ids.map((specialtyId) => ({ userId, specialtyId })),
          skipDuplicates: true,
        });
      }
      await tx.user.update({
        where: { id: userId },
        data: {
          responsible: true,
          specialtyId: ids[0] ?? null,
        },
      });
    });
  }

  console.log(
    `Concluído. ${desired.size} usuário(s) atualizado(s). Mesas sem specialty: ${missingSpecialty}. Técnicos sem usuário portal: ${missingUser}.`,
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
