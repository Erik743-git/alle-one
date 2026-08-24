/**
 * Preenche apontamentos de rendimento para um mês inteiro (demo / calendário).
 *
 * - Seg–Sex: 6–9h normais, almoço 40–90 min (gap entre blocos manhã/tarde)
 * - 2 dias por semana com pouco tempo (~5h) → alerta laranja no calendário
 * - Hora extra em alguns dias (não todos)
 * - Alguns sábados e domingos (não todos)
 * - Descrições sobre Alle One + API Millpar + testes
 *
 * Uso:
 *   cd backend
 *   npx ts-node prisma/scripts/seed-rendimento-month.ts
 *   npx ts-node prisma/scripts/seed-rendimento-month.ts --year=2026 --month=8
 *   npx ts-node prisma/scripts/seed-rendimento-month.ts --email=voce@empresa.com
 *   npx ts-node prisma/scripts/seed-rendimento-month.ts --dry-run
 *   npx ts-node prisma/scripts/seed-rendimento-month.ts --clean   # remove seed anterior
 */
import 'dotenv/config';
import { PrismaClient, PortalTicketAppointmentSyncStatus } from '@prisma/client';

const SEED_PREFIX = 'Dev seed —';
const prisma = new PrismaClient();

type Args = {
  year: number;
  month: number;
  email: string;
  dryRun: boolean;
  clean: boolean;
};

type TicketTheme = {
  ticketNumber: number;
  title: string;
  tasks: string[];
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let year = new Date().getFullYear();
  let month = new Date().getMonth() + 1;
  let email = process.env.SEED_USER_EMAIL?.trim() || 'erik.manarin@alletecnologia.com';
  let dryRun = false;
  let clean = false;

  for (const arg of argv) {
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--clean') clean = true;
    else if (arg.startsWith('--year=')) year = Number(arg.slice(7));
    else if (arg.startsWith('--month=')) month = Number(arg.slice(8));
    else if (arg.startsWith('--email=')) email = arg.slice(8);
  }

  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    throw new Error('Ano/mês inválidos. Use --year=2026 --month=8');
  }

  return { year, month, email, dryRun, clean };
}

/** PRNG determinístico para o mesmo mês gerar sempre o mesmo padrão. */
function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function minutesToTime(total: number): string {
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${pad(h)}:${pad(m)}`;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function addMinutes(time: string, delta: number): string {
  return minutesToTime(timeToMinutes(time) + delta);
}

function ymd(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function dayOfWeek(year: number, month: number, day: number): number {
  return new Date(year, month - 1, day).getDay();
}

const THEMES: Omit<TicketTheme, 'ticketNumber'>[] = [
  {
    title: 'Alle One — automações e admin de tickets',
    tasks: [
      'Montagem das regras de automação por mudança de estágio',
      'Tela de automações no admin com gatilhos e ações',
      'Ajuste dos modais de estágio e abertura automática',
      'Testes das automações ao abrir ticket e mudar estágio',
      'Correção de validação nos filtros salvos de tickets',
    ],
  },
  {
    title: 'Alle One — sync TiFlux e produção',
    tasks: [
      'Configuração do sync contínuo TiFlux para o espelho',
      'Cron do ETL cutover-final-sync em produção',
      'Conferência de health do espelho e do portal canônico',
      'Deploy das migrations de automação e catálogos',
      'Patch do Nginx para rotas admin de ticket',
    ],
  },
  {
    title: 'Alle One — catálogos por empresa e UX cliente',
    tasks: [
      'Catálogos de especialidade liberados por empresa',
      'Tela admin para editar o que o cliente pode abrir',
      'Abertura de ticket sem campos de GMUD para cliente',
      'Preenchimento automático do solicitante no novo ticket',
      'Revisão do fluxo de abertura no portal cliente',
    ],
  },
  {
    title: 'Millpar — API de integração',
    tasks: [
      'Criação dos endpoints principais da API Millpar',
      'Modelagem de pedidos e retorno para o sistema legado',
      'Autenticação e permissões básicas na API',
      'Tratamento de erros e respostas padronizadas',
      'Ajustes após review do código da API',
    ],
  },
  {
    title: 'Millpar — testes e estabilização',
    tasks: [
      'Testes manuais dos fluxos de pedido na API',
      'Correção de bug no cadastro de cliente',
      'Teste de carga leve nos endpoints críticos',
      'Revisão de logs e mensagens de erro',
      'Documentação rápida para o time usar a API',
    ],
  },
];

type ApptInsert = {
  ticketNumber: number;
  date: string;
  initTime: string;
  endTime: string;
  description: string;
  serviceName: 'HORA NORMAL' | 'HORA EXTRA';
};

function buildDayAppointments(
  date: string,
  dayIndex: number,
  rand: () => number,
  tickets: TicketTheme[],
  opts: {
    lowTime: boolean;
    withOvertime: boolean;
    weekend: boolean;
  },
): ApptInsert[] {
  const pickTask = (): { ticket: TicketTheme; text: string } => {
    const ticket = tickets[dayIndex % tickets.length];
    const text = ticket.tasks[Math.floor(rand() * ticket.tasks.length)];
    return { ticket, text };
  };

  if (opts.lowTime) {
    const { ticket, text } = pickTask();
    const start = rand() > 0.5 ? '08:00' : '08:30';
    const workMin = 280 + Math.floor(rand() * 40); // ~4h40–5h20
    return [
      {
        ticketNumber: ticket.ticketNumber,
        date,
        initTime: start,
        endTime: addMinutes(start, workMin),
        description: `${SEED_PREFIX} ${text} (dia curto)`,
        serviceName: 'HORA NORMAL',
      },
    ];
  }

  const lunchMin = 40 + Math.floor(rand() * 51); // 40–90 min
  const targetWorkMin =
    opts.weekend
      ? 240 + Math.floor(rand() * 120) // 4–6h fim de semana
      : 360 + Math.floor(rand() * 181); // 6–9h úteis

  const morningShare = 0.45 + rand() * 0.12;
  const morningWork = Math.round(targetWorkMin * morningShare);
  const afternoonWork = targetWorkMin - morningWork;

  const startMorning = rand() > 0.3 ? '08:00' : '08:30';
  const endMorning = addMinutes(startMorning, morningWork);
  const startAfternoon = addMinutes(endMorning, lunchMin);
  const endAfternoon = addMinutes(startAfternoon, afternoonWork);

  const morning = pickTask();
  const afternoon = pickTask();

  const rows: ApptInsert[] = [
    {
      ticketNumber: morning.ticket.ticketNumber,
      date,
      initTime: startMorning,
      endTime: endMorning,
      description: `${SEED_PREFIX} ${morning.text}`,
      serviceName: 'HORA NORMAL',
    },
    {
      ticketNumber: afternoon.ticket.ticketNumber,
      date,
      initTime: startAfternoon,
      endTime: endAfternoon,
      description: `${SEED_PREFIX} ${afternoon.text}`,
      serviceName: 'HORA NORMAL',
    },
  ];

  if (opts.withOvertime) {
    const heMin = 60 + Math.floor(rand() * 61); // 1–2h
    const heStart = '18:30';
    const he = pickTask();
    rows.push({
      ticketNumber: he.ticket.ticketNumber,
      date,
      initTime: heStart,
      endTime: addMinutes(heStart, heMin),
      description: `${SEED_PREFIX} ${he.text} (hora extra)`,
      serviceName: 'HORA EXTRA',
    });
  }

  return rows;
}

function shouldIncludeWeekend(dow: number, day: number, rand: () => number): boolean {
  if (dow === 6) return day <= 22 && rand() > 0.55; // ~45% dos sábados
  if (dow === 0) return day <= 15 && rand() > 0.72; // ~28% dos domingos (menos)
  return true;
}

/** Quarta e sexta de cada semana → pouco tempo (alerta). */
function isLowTimeDay(dow: number): boolean {
  return dow === 3 || dow === 5; // qua, sex
}

async function main() {
  const args = parseArgs();
  const { year, month, email, dryRun, clean } = args;
  const rand = seededRand(year * 100 + month);
  const today = new Date();
  const todayYmd = ymd(today.getFullYear(), today.getMonth() + 1, today.getDate());

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' }, deletedAt: null },
    select: { id: true, name: true, email: true, specialtyId: true },
  });
  if (!user) {
    throw new Error(`Usuário não encontrado: ${email}`);
  }

  let specialtyId = user.specialtyId;
  if (!specialtyId) {
    const spec = await prisma.specialty.findFirst({
      where: { deletedAt: null, active: true },
      orderBy: { name: 'asc' },
    });
    specialtyId = spec?.id ?? null;
  }

  const company = await prisma.company.findFirst({
    where: { deletedAt: null, tifluxClientId: { not: null } },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, tifluxClientId: true },
  });
  if (!company?.tifluxClientId) {
    throw new Error('Nenhuma empresa com tiflux_client_id encontrada.');
  }

  if (clean && !dryRun) {
    const deleted = await prisma.portalTicketAppointment.deleteMany({
      where: {
        createdBy: user.id,
        description: { startsWith: SEED_PREFIX },
      },
    });
    console.log(`Removidos ${deleted.count} apontamentos seed anteriores.`);
  }

  const maxTicket = await prisma.portalTicket.aggregate({
    _max: { ticketNumber: true },
  });
  let nextTicket = Math.max(maxTicket._max.ticketNumber ?? 0, 900000) + 1;

  const tickets: TicketTheme[] = [];
  for (const theme of THEMES) {
    let existing = await prisma.portalTicket.findFirst({
      where: {
        title: theme.title,
        createdBy: user.id,
        origin: 'PORTAL',
      },
      select: { ticketNumber: true, title: true },
    });

    if (!existing && !dryRun) {
      await prisma.portalTicket.create({
        data: {
          ticketNumber: nextTicket,
          title: theme.title,
          clientName: company.name,
          clientExternalId: company.tifluxClientId,
          createdByWayOf: 'Portal',
          priorityName: 'Média',
          statusName: 'Em andamento',
          stageName: 'Em andamento',
          specialtyId,
          isClosed: false,
          origin: 'PORTAL',
          createdBy: user.id,
          createdAtSource: new Date(),
          updatedAtSource: new Date(),
        },
      });
      existing = { ticketNumber: nextTicket, title: theme.title };
      nextTicket += 1;
    }

    tickets.push({
      ticketNumber: existing?.ticketNumber ?? nextTicket++,
      title: theme.title,
      tasks: theme.tasks,
    });
  }

  const lastDay = daysInMonth(year, month);
  const allAppointments: ApptInsert[] = [];

  for (let day = 1; day <= lastDay; day += 1) {
    const date = ymd(year, month, day);
    if (date > todayYmd) continue;

    const dow = dayOfWeek(year, month, day);
    if (!shouldIncludeWeekend(dow, day, rand)) continue;

    const lowTime = dow >= 1 && dow <= 5 && isLowTimeDay(dow);
    const weekend = dow === 0 || dow === 6;
    const withOvertime =
      !lowTime &&
      !weekend &&
      rand() > 0.68; // ~32% dos dias úteis cheios

    allAppointments.push(
      ...buildDayAppointments(date, day, rand, tickets, {
        lowTime,
        withOvertime,
        weekend,
      }),
    );
  }

  console.log('\n========== SEED RENDIMENTO ==========');
  console.log(`Usuário: ${user.name} <${user.email}>`);
  console.log(`Período: ${ymd(year, month, 1)} → ${ymd(year, month, lastDay)} (até hoje: ${todayYmd})`);
  console.log(`Tickets: ${tickets.map((t) => `#${t.ticketNumber}`).join(', ')}`);
  console.log(`Apontamentos a criar: ${allAppointments.length}`);
  console.log(`Modo: ${dryRun ? 'DRY-RUN' : clean ? 'CLEAN + INSERT' : 'INSERT'}`);

  if (dryRun) {
    const sample = allAppointments.slice(0, 6);
    console.log('\nAmostra:');
    for (const row of sample) {
      console.log(
        `  ${row.date} ${row.initTime}-${row.endTime} [${row.serviceName}] #${row.ticketNumber} — ${row.description.slice(0, 60)}…`,
      );
    }
    return;
  }

  const batchSize = 50;
  let created = 0;
  for (let i = 0; i < allAppointments.length; i += batchSize) {
    const chunk = allAppointments.slice(i, i + batchSize);
    await prisma.portalTicketAppointment.createMany({
      data: chunk.map((row) => ({
        ticketNumber: row.ticketNumber,
        appointmentDate: new Date(`${row.date}T12:00:00.000Z`),
        initTime: row.initTime,
        endTime: row.endTime,
        description: row.description,
        serviceName: row.serviceName,
        attendance: 'Remote',
        syncStatus: PortalTicketAppointmentSyncStatus.PORTAL_ONLY,
        createdBy: user.id,
      })),
    });
    created += chunk.length;
  }

  const normalMin = allAppointments
    .filter((a) => a.serviceName === 'HORA NORMAL')
    .reduce((acc, a) => acc + (timeToMinutes(a.endTime) - timeToMinutes(a.initTime)), 0);
  const heMin = allAppointments
    .filter((a) => a.serviceName === 'HORA EXTRA')
    .reduce((acc, a) => acc + (timeToMinutes(a.endTime) - timeToMinutes(a.initTime)), 0);

  console.log(`\nCriados ${created} apontamentos.`);
  console.log(
    `Totais: ${Math.floor(normalMin / 60)}h${pad(normalMin % 60)} normais + ${Math.floor(heMin / 60)}h${pad(heMin % 60)} HE`,
  );
  console.log('Recarregue o calendário de rendimento/apontamentos no portal.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
