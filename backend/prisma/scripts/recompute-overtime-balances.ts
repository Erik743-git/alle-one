/**
 * Recalcula rendimento_overtime_balances para todos os colaboradores.
 *
 * Usa a mesma regra do portal (após fix plantão):
 *   saldo = HE TiFlux (período folha 26→25, union, só HORA EXTRA)
 *         − HE aprovada (rendimento_day_events OVERTIME APPROVED)
 *         − justificativas aprovadas com debit_overtime
 *
 * Não altera alertas, justificativas pendentes nem aprovações — só persiste o saldo.
 *
 * Uso:
 *   cd backend
 *   npx ts-node prisma/scripts/recompute-overtime-balances.ts              # dry-run
 *   npx ts-node prisma/scripts/recompute-overtime-balances.ts --apply      # grava no banco
 *   npx ts-node prisma/scripts/recompute-overtime-balances.ts --apply --date=2026-07-21
 *   npx ts-node prisma/scripts/recompute-overtime-balances.ts --apply --user=uuid-ou-email
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { resolvePayrollPeriodRange } from '../../src/modules/rendimento/rendimento-payroll-period.helper';
import {
  computeUnionWorkedMinutes,
  type AppointmentMinutesInput,
} from '../../src/modules/rendimento/rendimento-worked-minutes.helper';

const prisma = new PrismaClient();

type AppointmentRow = AppointmentMinutesInput & {
  appointment_id?: number;
};

function parseArgs() {
  const apply = process.argv.includes('--apply');
  let date = new Date();
  date.setHours(0, 0, 0, 0);
  let userFilter: string | null = null;

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--date=')) {
      const raw = arg.slice('--date='.length).trim();
      const parsed = new Date(`${raw}T00:00:00`);
      if (Number.isNaN(parsed.getTime())) {
        throw new Error(`Data inválida: ${raw}`);
      }
      date = parsed;
      date.setHours(0, 0, 0, 0);
    } else if (arg.startsWith('--user=')) {
      userFilter = arg.slice('--user='.length).trim().toLowerCase();
    }
  }

  return { apply, date, userFilter };
}

function formatMinutes(totalMinutes: number): string {
  const sign = totalMinutes < 0 ? '-' : '';
  const m = Math.abs(Math.trunc(totalMinutes));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${sign}${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function netBalance(
  periodOvertimeMinutes: number,
  approvedOvertimeMinutes: number,
  debitedMinutes: number,
): number {
  return (
    Math.trunc(periodOvertimeMinutes) -
    Math.trunc(approvedOvertimeMinutes) -
    Math.trunc(debitedMinutes)
  );
}

async function loadTifluxEmailMap(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const rows = await prisma.$queryRaw<
    Array<{ external_id: number; email: string | null }>
  >`
    SELECT external_id, email
    FROM tiflux.users
    WHERE coalesce(active, true) = true
      AND email IS NOT NULL
      AND trim(email) <> ''
  `;
  for (const row of rows) {
    const email = row.email?.trim().toLowerCase();
    if (!email) continue;
    map.set(email, Number(row.external_id));
  }
  return map;
}

async function fetchAppointments(
  tifluxUserId: number,
  startIso: string,
  endIso: string,
): Promise<AppointmentRow[]> {
  return prisma.$queryRaw<AppointmentRow[]>`
    SELECT
      a.appointment_date::text AS appointment_date,
      a.init_time::text AS init_time,
      a.end_time::text AS end_time,
      a.valorization_raw,
      coalesce(
        CASE
          WHEN a.init_time IS NULL OR a.end_time IS NULL THEN 0
          WHEN a.end_time::time >= a.init_time::time
            THEN extract(epoch FROM (a.end_time::time - a.init_time::time)) / 60
          ELSE extract(epoch FROM ((a.end_time::time + interval '24 hours') - a.init_time::time)) / 60
        END,
        0
      )::int AS minutes
    FROM tiflux.ticket_appointments a
    WHERE a.user_external_id = ${tifluxUserId}
      AND a.appointment_date::date BETWEEN ${startIso}::date AND ${endIso}::date
  `;
}

async function sumApprovedOvertimeMinutes(
  userId: string,
  startIso: string,
  endIso: string,
): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ total: number }>>`
    SELECT coalesce(sum(minutes), 0)::int AS total
    FROM rendimento_day_events
    WHERE user_id = ${userId}
      AND date_ref BETWEEN ${startIso}::date AND ${endIso}::date
      AND event_type = 'OVERTIME'
      AND status = 'APPROVED'
      AND debit_protected = true
      AND deleted_at IS NULL
  `;
  return Number(rows[0]?.total) || 0;
}

async function sumDebitedJustificationMinutes(
  userId: string,
  startIso: string,
  endIso: string,
): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ total: number }>>`
    SELECT coalesce(sum(overtime_minutes), 0)::int AS total
    FROM rendimento_gap_justifications
    WHERE user_id = ${userId}
      AND date_ref BETWEEN ${startIso}::date AND ${endIso}::date
      AND status = 'APPROVED'
      AND debit_overtime = true
      AND deleted_at IS NULL
  `;
  return Number(rows[0]?.total) || 0;
}

async function getStoredBalanceMinutes(userId: string): Promise<number | null> {
  const row = await prisma.rendimentoOvertimeBalance.findUnique({
    where: { userId },
    select: { minutes: true },
  });
  return row?.minutes ?? null;
}

async function upsertBalance(userId: string, minutes: number): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO rendimento_overtime_balances (user_id, minutes, updated_at)
    VALUES (${userId}, ${minutes}, NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET minutes = ${minutes}, updated_at = NOW()
  `;
}

async function main() {
  const { apply, date, userFilter } = parseArgs();
  const payroll = resolvePayrollPeriodRange(date);

  console.log('==========================================================');
  console.log('  RECÁLCULO DE SALDO DE HORAS EXTRAS');
  console.log(`  Período folha: ${payroll.label} (${payroll.startIso} → ${payroll.endIso})`);
  console.log(`  Modo: ${apply ? 'APLICAR (grava no banco)' : 'DRY-RUN (somente exibe)'}`);
  if (userFilter) console.log(`  Filtro usuário: ${userFilter}`);
  console.log('==========================================================\n');

  const tifluxByEmail = await loadTifluxEmailMap();

  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      role: { in: ['ADMIN', 'COLLABORATOR', 'PJ'] },
      ...(userFilter
        ? {
            OR: [
              { id: userFilter },
              { email: { equals: userFilter, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  });

  if (!users.length) {
    console.log('Nenhum usuário encontrado.');
    return;
  }

  let updated = 0;
  let unchanged = 0;
  let skippedNoTiflux = 0;

  for (const user of users) {
    const email = user.email.trim().toLowerCase();
    const tifluxUserId = tifluxByEmail.get(email) ?? null;

    let periodOvertimeMinutes = 0;
    if (tifluxUserId != null) {
      const rows = await fetchAppointments(
        tifluxUserId,
        payroll.startIso,
        payroll.endIso,
      );
      periodOvertimeMinutes = computeUnionWorkedMinutes(rows, 'EXTRA');
    } else {
      skippedNoTiflux += 1;
    }

    const approvedOvertimeMinutes = await sumApprovedOvertimeMinutes(
      user.id,
      payroll.startIso,
      payroll.endIso,
    );
    const debitedMinutes = await sumDebitedJustificationMinutes(
      user.id,
      payroll.startIso,
      payroll.endIso,
    );
    const newBalance = netBalance(
      periodOvertimeMinutes,
      approvedOvertimeMinutes,
      debitedMinutes,
    );
    const oldBalance = await getStoredBalanceMinutes(user.id);
    const changed = oldBalance == null || oldBalance !== newBalance;

    if (changed || oldBalance == null) {
      console.log(
        [
          user.name,
          `<${email}>`,
          `HE período=${formatMinutes(periodOvertimeMinutes)}`,
          `aprovadas=${formatMinutes(approvedOvertimeMinutes)}`,
          `débitos justif.=${formatMinutes(debitedMinutes)}`,
          `saldo ${oldBalance == null ? '(novo)' : formatMinutes(oldBalance)} → ${formatMinutes(newBalance)}`,
          tifluxUserId == null ? '[sem TiFlux]' : '',
        ]
          .filter(Boolean)
          .join(' | '),
      );
    }

    if (changed) {
      if (apply) {
        await upsertBalance(user.id, newBalance);
      }
      updated += 1;
    } else {
      unchanged += 1;
    }
  }

  console.log('\n--- Resumo ---');
  console.log(`Usuários processados: ${users.length}`);
  console.log(`Saldo alterado: ${updated}`);
  console.log(`Saldo igual (sem mudança): ${unchanged}`);
  console.log(`Sem vínculo TiFlux (HE período=0): ${skippedNoTiflux}`);
  if (!apply) {
    console.log('\nNenhuma alteração gravada. Rode com --apply para persistir.');
  } else {
    console.log('\nSaldos atualizados em rendimento_overtime_balances.');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
