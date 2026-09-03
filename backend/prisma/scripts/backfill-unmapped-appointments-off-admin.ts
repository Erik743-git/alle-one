/**
 * Migração única: move apontamentos que caíram no fallback antigo (primeiro
 * ADMIN ativo) para o usuário dedicado "Não mapeado" — só os que ainda NÃO
 * têm e-mail casado no TiFlux (não mexe em nada que o admin apontou de
 * verdade, manualmente, sem vínculo com o TiFlux).
 *
 * Também lista, ao final, quais técnicos do TiFlux estão sem e-mail casado
 * no portal (pra corrigir o cadastro deles e o ETL passar a atribuir certo
 * nas próximas rodadas).
 *
 * Uso:
 *   cd backend
 *   npx ts-node prisma/scripts/backfill-unmapped-appointments-off-admin.ts <email-do-admin-usado-como-fallback-antigo>
 *   npx ts-node prisma/scripts/backfill-unmapped-appointments-off-admin.ts jose.serpa@alletecnologia.com --dry-run
 *
 * Idempotente: pode rodar de novo sem efeito colateral (WHERE created_by = <admin antigo> só encontra o que ainda não foi movido).
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const UNMAPPED_FALLBACK_EMAIL =
  'apontamentos.nao-mapeados@alletecnologia.internal';

async function main() {
  const oldAdminEmail = process.argv[2]?.trim();
  const dryRun = process.argv.includes('--dry-run');

  if (!oldAdminEmail || oldAdminEmail.startsWith('--')) {
    throw new Error(
      'Uso: npx ts-node prisma/scripts/backfill-unmapped-appointments-off-admin.ts <email-do-admin-usado-como-fallback-antigo> [--dry-run]',
    );
  }

  const oldAdmin = await prisma.user.findUnique({
    where: { email: oldAdminEmail },
    select: { id: true, name: true, email: true },
  });
  if (!oldAdmin) {
    throw new Error(`Usuário não encontrado: ${oldAdminEmail}`);
  }

  const affectedCountRows = await prisma.$queryRawUnsafe<
    Array<{ c: number; total_minutes: number }>
  >(
    `
    SELECT
      count(*)::int AS c,
      COALESCE(SUM(
        CASE
          WHEN p.end_time >= p.init_time
            THEN EXTRACT(EPOCH FROM (p.end_time::time - p.init_time::time)) / 60
          ELSE EXTRACT(EPOCH FROM (p.end_time::time + interval '24 hours' - p.init_time::time)) / 60
        END
      ), 0)::int AS total_minutes
    FROM portal_ticket_appointments p
    WHERE p.created_by = $1
      AND p.tiflux_appointment_external_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM tiflux.ticket_appointments a
        INNER JOIN tiflux.users tu ON tu.external_id = a.user_external_id
        INNER JOIN users u
          ON lower(trim(u.email)) = lower(trim(tu.email))
         AND u.deleted_at IS NULL
        WHERE a.external_id = p.tiflux_appointment_external_id
          AND u.id = $1
      )
    `,
    oldAdmin.id,
  );
  const affected = affectedCountRows[0] ?? { c: 0, total_minutes: 0 };
  console.log(
    `Encontrados ${affected.c} apontamentos (${(affected.total_minutes / 60).toFixed(2)}h) hoje atribuídos a "${oldAdmin.name}" (${oldAdmin.email}) sem match de e-mail real.`,
  );

  if (dryRun) {
    console.log('Dry-run: nenhum write.');
  } else if (affected.c > 0) {
    const pseudo = await prisma.user.upsert({
      where: { email: UNMAPPED_FALLBACK_EMAIL },
      update: {},
      create: {
        name: 'Apontamentos não mapeados (TiFlux)',
        email: UNMAPPED_FALLBACK_EMAIL,
        passwordHash: null,
        role: 'COLLABORATOR',
        status: 'INACTIVE',
        firstAccess: false,
      },
      select: { id: true, email: true },
    });

    const moved = await prisma.$executeRawUnsafe(
      `
      UPDATE portal_ticket_appointments p
      SET created_by = $1, updated_at = NOW()
      WHERE p.created_by = $2
        AND p.tiflux_appointment_external_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM tiflux.ticket_appointments a
          INNER JOIN tiflux.users tu ON tu.external_id = a.user_external_id
          INNER JOIN users u
            ON lower(trim(u.email)) = lower(trim(tu.email))
           AND u.deleted_at IS NULL
          WHERE a.external_id = p.tiflux_appointment_external_id
            AND u.id = $2
        )
      `,
      pseudo.id,
      oldAdmin.id,
    );
    console.log(
      `Movidos ${moved} apontamentos de "${oldAdmin.name}" para "${pseudo.email}".`,
    );
  }

  const unmatched = await prisma.$queryRawUnsafe<
    Array<{
      external_id: number;
      email: string | null;
      name: string | null;
      total_apontamentos: number;
    }>
  >(
    `
    SELECT tu.external_id, tu.email, tu.name, count(*)::int AS total_apontamentos
    FROM tiflux.ticket_appointments a
    INNER JOIN tiflux.users tu ON tu.external_id = a.user_external_id
    WHERE NOT EXISTS (
      SELECT 1 FROM users u
      WHERE lower(trim(u.email)) = lower(trim(tu.email)) AND u.deleted_at IS NULL
    )
    GROUP BY tu.external_id, tu.email, tu.name
    ORDER BY total_apontamentos DESC
    `,
  );

  console.log('\nTécnicos do TiFlux sem e-mail casado no portal (corrija o cadastro deles pra próxima rodada do ETL já atribuir certo):');
  console.table(unmatched);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
