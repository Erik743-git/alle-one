/**
 * Sync final de cutover: copia espelho TiFlux (schema tiflux.*) → tabelas portal.
 *
 * Premissa: em produção o `alleone-tiflux-sync` CONTINUA rodando até este ETL
 * ser executado e validado. As flags default (canonical=false, write=true)
 * não mudam sozinhas — o flip é manual depois da conferência.
 *
 * Uso:
 *   cd backend
 *   npx ts-node prisma/scripts/cutover-final-sync.ts
 *   npx ts-node prisma/scripts/cutover-final-sync.ts --tickets-only
 *   npx ts-node prisma/scripts/cutover-final-sync.ts --appointments-only
 *   npx ts-node prisma/scripts/cutover-final-sync.ts --limit=5000 --dry-run
 *
 * Fluxo recomendado (prod):
 *   1. Sync TiFlux ainda ativo (espelho fresco).
 *   2. Rodar este script (idempotente).
 *   3. Conferir contagens / amostragem.
 *   4. Staging: TICKETS_PORTAL_CANONICAL=true.
 *   5. Só depois: TICKETS_TIFLUX_WRITE=false e parar sync.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const scriptsDir = __dirname;

function runTs(scriptName: string, extraArgs: string[]) {
  const scriptPath = path.join(scriptsDir, scriptName);
  console.log(`\n=== ${scriptName} ${extraArgs.join(' ')} ===`);
  const result = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['ts-node', scriptPath, ...extraArgs],
    { stdio: 'inherit', cwd: path.join(scriptsDir, '..', '..'), shell: true },
  );
  if (result.status !== 0) {
    throw new Error(`${scriptName} falhou com exit ${result.status}`);
  }
}

async function printCounts(label: string) {
  const portalTickets = await prisma.portalTicket.count();
  const portalAppointments = await prisma.portalTicketAppointment.count();
  let tifluxTickets: number | string = 'n/a';
  let tifluxAppointments: number | string = 'n/a';
  try {
    const r = await prisma.$queryRawUnsafe<Array<{ c: number }>>(
      'SELECT count(*)::int AS c FROM tiflux.tickets',
    );
    tifluxTickets = r[0]?.c ?? 0;
  } catch (e) {
    tifluxTickets = e instanceof Error ? e.message : String(e);
  }
  try {
    const r = await prisma.$queryRawUnsafe<Array<{ c: number }>>(
      'SELECT count(*)::int AS c FROM tiflux.ticket_appointments',
    );
    tifluxAppointments = r[0]?.c ?? 0;
  } catch (e) {
    tifluxAppointments = e instanceof Error ? e.message : String(e);
  }

  console.log(`\n[${label}]`);
  console.log(
    JSON.stringify(
      {
        flags: {
          TICKETS_PORTAL_CANONICAL: process.env.TICKETS_PORTAL_CANONICAL ?? '(unset→false)',
          TICKETS_TIFLUX_WRITE: process.env.TICKETS_TIFLUX_WRITE ?? '(unset→true)',
        },
        tifluxTickets,
        portalTickets,
        tifluxAppointments,
        portalAppointments,
      },
      null,
      2,
    ),
  );
}

async function main() {
  const ticketsOnly = process.argv.includes('--tickets-only');
  const appointmentsOnly = process.argv.includes('--appointments-only');
  const dryRun = process.argv.includes('--dry-run');
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const extra: string[] = [];
  if (limitArg) extra.push(limitArg);
  if (dryRun) extra.push('--dry-run');

  console.log('Cutover final sync — tiflux.* → portal_*');
  console.log(
    'Produção: mantenha alleone-tiflux-sync ativo até validar contagens e só então altere flags.',
  );

  await printCounts('antes');

  if (!appointmentsOnly) {
    runTs('etl-tiflux-tickets-to-portal.ts', extra);
  }
  if (!ticketsOnly) {
    runTs('etl-tiflux-appointments-to-portal.ts', extra);
  }

  await printCounts('depois');

  console.log(`
Próximos passos (NÃO automáticos):
  1. Conferir amostragem de tickets/apontamentos no portal.
  2. Em staging: TICKETS_PORTAL_CANONICAL=true (leitura portal).
  3. Validar UI/lista/detalhe/apontamentos.
  4. TICKETS_TIFLUX_WRITE=false (create só portal).
  5. Parar alleone-tiflux-sync somente quando estável.
Rollback: canonical=false + write=true (defaults).
`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
