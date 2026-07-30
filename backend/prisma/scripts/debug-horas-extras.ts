/**
 * Teste de conferência de Horas Extras (HE).
 *
 * Para TODOS os usuários, do dia 26 do mês passado até hoje, compara:
 *  - Soma "ticket a ticket" (cada card/apontamento somado, COM sobreposição)
 *  - União por dia (o número que o portal mostra em "Horas extras")
 *
 * Usa exatamente os mesmos helpers do app (classificação EXTRA + união por dia).
 *
 * Uso: npx ts-node prisma/scripts/debug-horas-extras.ts
 *      (opcional) npx ts-node prisma/scripts/debug-horas-extras.ts 2026-06-25
 */
import { PrismaClient } from '@prisma/client';
import {
  computeRawAppointmentMinutes,
  computeUnionWorkedMinutes,
  type AppointmentMinutesInput,
} from '../../src/modules/rendimento/rendimento-worked-minutes.helper';
import { overtimeKindFromValorization } from '../../src/modules/rendimento/rendimento-day-insights';

const prisma = new PrismaClient();

type Row = {
  user_external_id: number | null;
  user_name: string | null;
  appointment_date: string;
  init_time: string | null;
  end_time: string | null;
  minutes: number;
  valorization_raw: unknown | null;
};

function fmt(totalMinutes: number): string {
  const m = Math.max(0, Math.trunc(totalMinutes));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function toDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function main() {
  const arg = process.argv[2];
  const today = arg ? new Date(`${arg}T00:00:00`) : new Date();
  today.setHours(0, 0, 0, 0);

  // "do dia 26 do mês passado até hoje"
  const start = new Date(today.getFullYear(), today.getMonth() - 1, 26);
  start.setHours(0, 0, 0, 0);
  const startStr = toDateOnly(start);
  const endStr = toDateOnly(today);

  console.log('==========================================================');
  console.log(`  CONFERÊNCIA DE HORAS EXTRAS`);
  console.log(`  Janela: ${startStr}  ->  ${endStr}  (dia 26 do mês passado até hoje)`);
  console.log('==========================================================\n');

  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `
    select
      a.user_external_id,
      u.name as user_name,
      a.appointment_date::text as appointment_date,
      a.init_time::text as init_time,
      a.end_time::text as end_time,
      coalesce(
        case
          when a.init_time is null or a.end_time is null then 0
          when a.end_time::time >= a.init_time::time
            then extract(epoch from (a.end_time::time - a.init_time::time)) / 60
          else extract(epoch from ((a.end_time::time + interval '24 hours') - a.init_time::time)) / 60
        end,
        0
      )::int as minutes,
      a.valorization_raw
    from tiflux.ticket_appointments a
    left join tiflux.users u on u.external_id = a.user_external_id
    where a.appointment_date::date between $1::date and $2::date
    order by a.user_external_id asc, a.appointment_date asc, a.init_time asc nulls last
    `,
    startStr,
    endStr,
  );

  // Agrupa por usuário
  const byUser = new Map<number, { name: string; rows: Row[] }>();
  for (const row of rows) {
    const uid = Number(row.user_external_id ?? 0);
    if (!byUser.has(uid)) {
      byUser.set(uid, { name: row.user_name ?? `(sem nome #${uid})`, rows: [] });
    }
    byUser.get(uid)!.rows.push(row);
  }

  let totalUnion = 0;
  let totalRaw = 0;
  let usersWithHe = 0;

  const lines: Array<{
    name: string;
    raw: number;
    union: number;
    diff: number;
  }> = [];

  for (const { name, rows: userRows } of byUser.values()) {
    const input: AppointmentMinutesInput[] = userRows.map((r) => ({
      appointment_date: r.appointment_date,
      init_time: r.init_time,
      end_time: r.end_time,
      minutes: Number(r.minutes) || 0,
      valorization_raw: r.valorization_raw,
    }));

    const heUnion = computeUnionWorkedMinutes(input, 'EXTRA');
    const heRaw = computeRawAppointmentMinutes(input, 'EXTRA');
    if (heUnion === 0 && heRaw === 0) continue;

    usersWithHe += 1;
    totalUnion += heUnion;
    totalRaw += heRaw;
    lines.push({ name, raw: heRaw, union: heUnion, diff: heRaw - heUnion });
  }

  lines.sort((a, b) => b.union - a.union);

  console.log(
    'USUÁRIO'.padEnd(34) +
      'SOMA CARDS'.padStart(12) +
      'EXIBIDO(união)'.padStart(16) +
      'SOBREPOSIÇÃO'.padStart(14),
  );
  console.log('-'.repeat(76));
  for (const l of lines) {
    console.log(
      l.name.slice(0, 33).padEnd(34) +
        fmt(l.raw).padStart(12) +
        fmt(l.union).padStart(16) +
        (l.diff > 0 ? fmt(l.diff) : '-').padStart(14),
    );
  }
  console.log('-'.repeat(76));
  console.log(
    'TOTAL'.padEnd(34) +
      fmt(totalRaw).padStart(12) +
      fmt(totalUnion).padStart(16) +
      (totalRaw - totalUnion > 0 ? fmt(totalRaw - totalUnion) : '-').padStart(14),
  );

  console.log('\n----------------------------------------------------------');
  console.log(`Usuários com HE no período: ${usersWithHe}`);
  console.log(`Soma de TODOS os cards (ticket a ticket): ${fmt(totalRaw)}  (${totalRaw} min)`);
  console.log(`Número EXIBIDO no portal (união por dia):  ${fmt(totalUnion)}  (${totalUnion} min)`);
  console.log(`Diferença (sobreposição removida):         ${fmt(totalRaw - totalUnion)}  (${totalRaw - totalUnion} min)`);
  console.log('----------------------------------------------------------\n');

  // Amostra: quais tipos de serviço viraram EXTRA (ajuda a validar a classificação)
  const serviceNames = new Map<string, number>();
  for (const row of rows) {
    if (overtimeKindFromValorization(row.valorization_raw) === 'EXTRA') {
      const raw = row.valorization_raw as Record<string, unknown> | null;
      let name = '(sem nome)';
      if (raw && typeof raw === 'object') {
        const cands = [
          (raw.loose_service as { name?: unknown })?.name,
          (raw.contract as { name?: unknown })?.name,
          (raw.service as { name?: unknown })?.name,
          (raw.way as { name?: unknown })?.name,
          raw.name,
        ];
        for (const c of cands) {
          const s = String(c ?? '').trim();
          if (s) {
            name = s;
            break;
          }
        }
      }
      serviceNames.set(name, (serviceNames.get(name) ?? 0) + 1);
    }
  }
  if (serviceNames.size) {
    console.log('Tipos de serviço classificados como HORA EXTRA (qtd apontamentos):');
    for (const [name, count] of [...serviceNames.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  - ${name}: ${count}`);
    }
    console.log('');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
