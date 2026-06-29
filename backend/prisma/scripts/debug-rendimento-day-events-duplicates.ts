/**
 * Diagnóstico read-only: duplicatas em rendimento_day_events (HE/plantão).
 *
 * Uso (VM ou local):
 *   cd backend
 *   npx ts-node prisma/scripts/debug-rendimento-day-events-duplicates.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('== (A) Apontamentos com PENDENTE vivo + decidida (incl. apagada) ==');
  const groupA = await prisma.$queryRaw<
    Array<{
      user_id: string;
      date_ref: Date;
      event_type: string;
      appointment_external_id: bigint;
      pend_vivas: bigint;
      decididas_total: bigint;
      decididas_apagadas: bigint;
    }>
  >`
    SELECT e.user_id, e.date_ref, e.event_type, e.appointment_external_id,
           count(*) FILTER (WHERE e.status = 'PENDING' AND e.deleted_at IS NULL)::bigint AS pend_vivas,
           count(*) FILTER (WHERE e.status IN ('APPROVED','REJECTED'))::bigint AS decididas_total,
           count(*) FILTER (WHERE e.status IN ('APPROVED','REJECTED') AND e.deleted_at IS NOT NULL)::bigint AS decididas_apagadas
    FROM rendimento_day_events e
    WHERE e.event_type IN ('OVERTIME','PLANTAO')
      AND e.appointment_external_id IS NOT NULL
    GROUP BY 1, 2, 3, 4
    HAVING count(*) FILTER (WHERE e.status = 'PENDING' AND e.deleted_at IS NULL) > 0
       AND count(*) FILTER (WHERE e.status IN ('APPROVED','REJECTED')) > 0
    ORDER BY e.date_ref DESC
    LIMIT 30
  `;
  console.table(
    groupA.map((r) => ({
      ...r,
      date_ref: r.date_ref.toISOString().slice(0, 10),
      appointment_external_id: String(r.appointment_external_id),
    })),
  );
  console.log(`Total grupos afetados (amostra max 30): ${groupA.length}`);

  console.log('\n== (B) source_key duplicado (vivo + apagado) ==');
  const groupB = await prisma.$queryRaw<
    Array<{
      user_id: string;
      source_key: string;
      total: bigint;
      vivas: bigint;
      apagadas: bigint;
    }>
  >`
    SELECT user_id, source_key,
           count(*)::bigint AS total,
           count(*) FILTER (WHERE deleted_at IS NULL)::bigint AS vivas,
           count(*) FILTER (WHERE deleted_at IS NOT NULL)::bigint AS apagadas
    FROM rendimento_day_events
    GROUP BY 1, 2
    HAVING count(*) > 1
    ORDER BY total DESC
    LIMIT 30
  `;
  console.table(
    groupB.map((r) => ({
      ...r,
      total: String(r.total),
      vivas: String(r.vivas),
      apagadas: String(r.apagadas),
    })),
  );
  console.log(`Total chaves duplicadas (amostra max 30): ${groupB.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
