/**
 * ETL idempotente: tiflux.ticket_appointments → portal_ticket_appointments (bulk SQL).
 *
 * `created_by` prioriza o User do portal cujo e-mail bate com tiflux.users
 * (via user_external_id do apontamento). Fallback: CUTOVER_ETL_CREATED_BY / ADMIN.
 *
 * Uso:
 *   cd backend
 *   npx ts-node prisma/scripts/etl-tiflux-appointments-to-portal.ts
 *   npx ts-node prisma/scripts/etl-tiflux-appointments-to-portal.ts --dry-run
 *   npx ts-node prisma/scripts/etl-tiflux-appointments-to-portal.ts --reassign-only
 *
 * Seguro com alleone-tiflux-sync ainda ativo (não apaga; só insert/update).
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function resolveFallbackUserId(): Promise<string> {
  const fromEnv = process.env.CUTOVER_ETL_CREATED_BY?.trim();
  if (fromEnv) return fromEnv;

  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN', deletedAt: null, status: 'ACTIVE' },
    select: { id: true, email: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!admin) {
    throw new Error(
      'Nenhum ADMIN ativo para createdBy do ETL. Defina CUTOVER_ETL_CREATED_BY=<userId>.',
    );
  }
  console.log(`Fallback createdBy ADMIN ${admin.email} (${admin.id})`);
  return admin.id;
}

/** SQL fragment: User.id via e-mail do técnico TiFlux, senão fallback. */
const CREATED_BY_EXPR = `
  COALESCE(
    (
      SELECT u.id
      FROM tiflux.users tu
      INNER JOIN users u
        ON lower(trim(u.email)) = lower(trim(tu.email))
       AND u.deleted_at IS NULL
      WHERE tu.external_id = a.user_external_id
        AND tu.email IS NOT NULL
        AND trim(tu.email) <> ''
      ORDER BY u.created_at ASC
      LIMIT 1
    ),
    $1
  )
`;

async function reassignCreatedBy(fallbackUserId: string): Promise<number> {
  const updated = await prisma.$executeRawUnsafe(
    `
    UPDATE portal_ticket_appointments p
    SET
      created_by = mapped.portal_user_id,
      updated_at = NOW()
    FROM tiflux.ticket_appointments a
    INNER JOIN LATERAL (
      SELECT u.id AS portal_user_id
      FROM tiflux.users tu
      INNER JOIN users u
        ON lower(trim(u.email)) = lower(trim(tu.email))
       AND u.deleted_at IS NULL
      WHERE tu.external_id = a.user_external_id
        AND tu.email IS NOT NULL
        AND trim(tu.email) <> ''
      ORDER BY u.created_at ASC
      LIMIT 1
    ) mapped ON true
    WHERE p.tiflux_appointment_external_id = a.external_id
      AND p.created_by IS DISTINCT FROM mapped.portal_user_id
    `,
  );

  // Linhas sem match de e-mail: garantir fallback (evita created_by órfão)
  await prisma.$executeRawUnsafe(
    `
    UPDATE portal_ticket_appointments p
    SET created_by = $1, updated_at = NOW()
    WHERE p.tiflux_appointment_external_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p.created_by)
    `,
    fallbackUserId,
  );

  return Number(updated) || 0;
}

async function printIdentityStats() {
  const total = await prisma.portalTicketAppointment.count({
    where: { tifluxAppointmentExternalId: { not: null } },
  });
  const matched =
    (await prisma.$queryRawUnsafe<Array<{ c: number }>>(`
      SELECT count(*)::int AS c
      FROM portal_ticket_appointments p
      WHERE p.tiflux_appointment_external_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM tiflux.ticket_appointments a
          INNER JOIN tiflux.users tu ON tu.external_id = a.user_external_id
          INNER JOIN users u
            ON lower(trim(u.email)) = lower(trim(tu.email))
           AND u.deleted_at IS NULL
          WHERE a.external_id = p.tiflux_appointment_external_id
            AND p.created_by = u.id
        )
    `)) ?? [];
  console.log(
    JSON.stringify(
      { totalWithExternalId: total, matchedByEmail: matched[0]?.c ?? 0 },
      null,
      2,
    ),
  );
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const reassignOnly = process.argv.includes('--reassign-only');
  const fallbackUserId = await resolveFallbackUserId();

  const before = await prisma.portalTicketAppointment.count();
  const sourceRows = await prisma.$queryRawUnsafe<Array<{ c: number }>>(
    `SELECT count(*)::int AS c FROM tiflux.ticket_appointments WHERE external_id IS NOT NULL`,
  );
  const source = sourceRows[0]?.c ?? 0;

  console.log(
    `ETL tiflux.ticket_appointments → portal_ticket_appointments (source=${source}, portal_antes=${before}${dryRun ? ', dry-run' : ''}${reassignOnly ? ', reassign-only' : ''})`,
  );

  if (dryRun) {
    console.log('Dry-run: nenhum write.');
    await printIdentityStats();
    return;
  }

  if (reassignOnly) {
    const n = await reassignCreatedBy(fallbackUserId);
    console.log(`Reatribuídos created_by≈${n}`);
    await printIdentityStats();
    return;
  }

  const inserted = await prisma.$executeRawUnsafe(
    `
    INSERT INTO portal_ticket_appointments (
      id, ticket_number, appointment_date, init_time, end_time, description,
      service_name, attendance, tiflux_appointment_external_id, sync_status,
      created_by, created_at, updated_at
    )
    SELECT
      gen_random_uuid()::text,
      a.ticket_number,
      COALESCE(a.appointment_date::date, CURRENT_DATE),
      COALESCE(to_char(a.init_time::time, 'HH24:MI'), '00:00'),
      COALESCE(to_char(a.end_time::time, 'HH24:MI'), '00:00'),
      COALESCE(NULLIF(trim(a.description), ''), '(sem descrição)'),
      left(
        COALESCE(
          NULLIF(trim(a.valorization_raw #>> '{loose_service,name}'), ''),
          NULLIF(trim(a.valorization_raw #>> '{contract,name}'), ''),
          NULLIF(trim(a.valorization_raw #>> '{service,name}'), ''),
          NULLIF(trim(a.valorization_raw #>> '{name}'), ''),
          'HORA NORMAL'
        ),
        120
      ),
      'Remote',
      a.external_id,
      'SYNCED'::"PortalTicketAppointmentSyncStatus",
      ${CREATED_BY_EXPR},
      NOW(),
      NOW()
    FROM tiflux.ticket_appointments a
    WHERE a.external_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM portal_ticket_appointments p
        WHERE p.tiflux_appointment_external_id = a.external_id
      )
    `,
    fallbackUserId,
  );

  await prisma.$executeRawUnsafe(
    `
    UPDATE portal_ticket_appointments p
    SET
      ticket_number = a.ticket_number,
      appointment_date = COALESCE(a.appointment_date::date, p.appointment_date),
      init_time = COALESCE(to_char(a.init_time::time, 'HH24:MI'), p.init_time),
      end_time = COALESCE(to_char(a.end_time::time, 'HH24:MI'), p.end_time),
      description = COALESCE(NULLIF(trim(a.description), ''), p.description),
      service_name = left(
        COALESCE(
          NULLIF(trim(a.valorization_raw #>> '{loose_service,name}'), ''),
          NULLIF(trim(a.valorization_raw #>> '{contract,name}'), ''),
          NULLIF(trim(a.valorization_raw #>> '{service,name}'), ''),
          NULLIF(trim(a.valorization_raw #>> '{name}'), ''),
          p.service_name
        ),
        120
      ),
      created_by = COALESCE(
        (
          SELECT u.id
          FROM tiflux.users tu
          INNER JOIN users u
            ON lower(trim(u.email)) = lower(trim(tu.email))
           AND u.deleted_at IS NULL
          WHERE tu.external_id = a.user_external_id
            AND tu.email IS NOT NULL
            AND trim(tu.email) <> ''
          ORDER BY u.created_at ASC
          LIMIT 1
        ),
        p.created_by
      ),
      sync_status = 'SYNCED'::"PortalTicketAppointmentSyncStatus",
      updated_at = NOW()
    FROM tiflux.ticket_appointments a
    WHERE p.tiflux_appointment_external_id = a.external_id
    `,
  );

  const after = await prisma.portalTicketAppointment.count();
  console.log(`Concluído: inserted≈${inserted} portal_appointments=${after}`);
  await printIdentityStats();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
