/**
 * Marca `users.responsible = true` para quem já era responsável no select
 * (mirror TiFlux attendant/admin ativo ou responsável em portal_tickets),
 * somente usuários ACTIVE não-CLIENT.
 *
 * Uso:
 *   cd backend && npx ts-node prisma/scripts/sync-ticket-responsibles-flag.ts
 */
import { PrismaClient, UserRole, UserStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const emails = new Set<string>();
  const names = new Set<string>();

  try {
    const tiflux =
      (await prisma.$queryRaw<Array<{ email: string | null; name: string | null }>>`
        SELECT tu.email, tu.name
        FROM tiflux.users tu
        WHERE COALESCE(tu.active, true) = true
          AND tu.type IN ('attendant', 'admin')
      `) ?? [];
    for (const row of tiflux) {
      if (row.email?.trim()) emails.add(row.email.trim().toLowerCase());
      if (row.name?.trim()) names.add(row.name.trim().toLowerCase());
    }
    console.log(`TiFlux attendants/admins: ${tiflux.length}`);
  } catch (err) {
    console.warn('tiflux.users indisponível:', err instanceof Error ? err.message : err);
  }

  const fromTickets = await prisma.portalTicket.findMany({
    where: {
      responsibleName: { not: null },
      responsibleExternalId: { not: null },
    },
    select: { responsibleName: true },
    distinct: ['responsibleName'],
    take: 2000,
  });
  for (const t of fromTickets) {
    const n = t.responsibleName?.trim().toLowerCase();
    if (n) names.add(n);
  }
  console.log(`Nomes distintos em portal_tickets: ${fromTickets.length}`);

  const candidates = await prisma.user.findMany({
    where: {
      deletedAt: null,
      status: UserStatus.ACTIVE,
      role: { in: [UserRole.ADMIN, UserRole.COLLABORATOR, UserRole.PJ] },
      responsible: false,
    },
    select: { id: true, name: true, email: true },
  });

  const toMark = candidates.filter((u) => {
    const email = u.email.trim().toLowerCase();
    const name = u.name.trim().toLowerCase();
    return emails.has(email) || names.has(name);
  });

  if (toMark.length === 0) {
    console.log('Nenhum usuário novo para marcar como responsável.');
    return;
  }

  const result = await prisma.user.updateMany({
    where: { id: { in: toMark.map((u) => u.id) } },
    data: { responsible: true },
  });

  console.log(`Marcados responsible=true: ${result.count}`);
  for (const u of toMark.slice(0, 30)) {
    console.log(`  - ${u.name} <${u.email}>`);
  }
  if (toMark.length > 30) console.log(`  ... +${toMark.length - 30}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
