/**
 * Insere apontamentos reais (25–31/08/2026) no ticket #62866 — Portal Alle One.
 *
 * Regras de agenda:
 *   - Início 08:00 (dia par) ou 09:00 (dia ímpar)
 *   - Almoço 20–60 min após ~3h30 de bloco contínuo (dias úteis)
 *   - Hora extra somente após 19:00 (ou dia inteiro no fim de semana)
 *   - Tarefas marcadas (HE) / FDS forçam HORA EXTRA
 *
 * Uso (na VM de produção, pasta backend com .env):
 *   npx ts-node prisma/scripts/seed-portal-appointments-aug25-31.ts --dry-run
 *   npx ts-node prisma/scripts/seed-portal-appointments-aug25-31.ts --email=erik.manarin@alletecnologia.com
 *   npx ts-node prisma/scripts/seed-portal-appointments-aug25-31.ts --clean --email=...
 */
import 'dotenv/config';
import { PrismaClient, PortalTicketAppointmentSyncStatus } from '@prisma/client';

const DEFAULT_TICKET = 62866;
const DEFAULT_EMAIL = 'erik.manarin@alletecnologia.com';

const prisma = new PrismaClient();

type Args = {
  ticketNumber: number;
  email: string;
  dryRun: boolean;
  clean: boolean;
};

type RawTask = {
  minutes: number;
  description: string;
  /** Força HORA EXTRA (após 19h em dia útil). */
  he?: boolean;
  /** Bloco noturno que cruza meia-noite (ex.: 22:00→00:00). */
  overnight?: boolean;
};

type PlannedRow = {
  date: string;
  initTime: string;
  endTime: string;
  description: string;
  serviceName: 'HORA NORMAL' | 'HORA EXTRA';
  ticketNumber: number;
};

/** Tarefas por dia — textos conforme planilha de apontamentos. */
const TASKS_BY_DATE: Record<string, RawTask[]> = {
  '2026-08-25': [
    { minutes: 75, description: 'Portal Alle One — Correção bugs lista/filtros de tickets e troca de cliente' },
    { minutes: 60, description: 'Portal Alle One — Pré-ticket sem responsável e transferência de mesa com especialidade' },
    { minutes: 45, description: 'Portal Alle One — Remoção dependências TiFlux em estágios e melhorias UX ticket' },
    { minutes: 45, description: 'Portal Alle One — Correções 2FA, selects, modal de imagem' },
    { minutes: 45, description: 'Portal Alle One — Nova tela de login, sidebar e destaque Novo ticket' },
    { minutes: 60, description: 'Portal Alle One — Zoom imagem; lápis cliente/solicitante; estágio automático' },
    { minutes: 30, description: 'Portal Alle One — Ajuste tamanho menu lateral' },
    { minutes: 45, description: 'Portal Alle One — Login hero desktop e ajustes mobile' },
    { minutes: 30, description: 'Portal Alle One — Commit, push e deploy teste/produção' },
  ],
  '2026-08-26': [
    { minutes: 90, description: 'Portal Alle One — Refatoração frontend segura' },
    { minutes: 90, description: 'Portal Alle One — PM2 cluster, gzip e otimizações' },
    { minutes: 120, description: 'Portal Alle One — Correções bugs QA tickets' },
    { minutes: 60, description: 'Portal Alle One — Smoke tests deploy autenticado' },
    { minutes: 60, description: 'Portal Alle One — Suporte Zabbix NGINX stub status VM' },
    { minutes: 60, description: 'Portal Alle One — Redesign ticket, filtros solicitante, apontamentos' },
    { minutes: 30, description: 'Portal Alle One — Validação planilha testes / E2E' },
  ],
  '2026-08-27': [
    { minutes: 150, description: 'Portal Alle One — Estabilização prod/teste PM2/Prisma/Nginx' },
    { minutes: 60, description: 'Portal Alle One — Periodicidades abertura automática' },
    { minutes: 90, description: 'Portal Alle One — Revisão pendências QA e stakeholders' },
    { minutes: 45, description: 'Portal Alle One — Modal apontamento rodapé com usuário' },
    { minutes: 60, description: 'Portal Alle One — Commits, push e deploy' },
    { minutes: 60, description: 'Portal Alle One — Investigação quedas e logs PM2' },
  ],
  '2026-08-28': [
    { minutes: 120, description: 'Portal Alle One — GMUD e troca cliente/solicitante no ticket' },
    { minutes: 90, description: 'Portal Alle One — Nova tela login hero' },
    { minutes: 90, description: 'Portal Alle One — Abertura automática e alertas apontamentos' },
    { minutes: 60, description: 'Portal Alle One — Ajuste hero e validação' },
    { minutes: 60, description: 'Portal Alle One — Deploy e validação teste' },
    { minutes: 90, description: 'Portal Alle One — Correções rotinas pré-ticket', he: true },
    { minutes: 30, description: 'Portal Alle One — Login hero e periodicidade semestral', he: true },
  ],
  '2026-08-29': [
    { minutes: 120, description: 'Portal Alle One — Multi-especialidade e sync catálogo TiFlux' },
    { minutes: 90, description: 'Portal Alle One — Rotinas classificação e import TiFlux' },
    { minutes: 30, description: 'Portal Alle One — Fix conflito external_id import' },
    { minutes: 90, description: 'Portal Alle One — Testes sync/import TiFlux' },
  ],
  '2026-08-30': [
    { minutes: 60, description: 'Portal Alle One — Justificativa lacuna e filtros dashboard' },
    { minutes: 60, description: 'Portal Alle One — Anexos rotinas automáticas' },
  ],
  '2026-08-31': [
    { minutes: 60, description: 'Portal Alle One — Ajustes UI dashboard' },
    { minutes: 60, description: 'Portal Alle One — Ajustes módulo Financeiro' },
    { minutes: 90, description: 'Portal Alle One — Otimização performance dashboard' },
    { minutes: 45, description: 'Portal Alle One — Correção assets login teste/prod' },
    { minutes: 60, description: 'Portal Alle One — Investigação Meus tickets vazio em prod' },
    { minutes: 75, description: 'Portal Alle One — Fix apontamento overnight e approve HE' },
    {
      minutes: 120,
      description: 'Portal Alle One — Commits, push e deploy madrugada',
      he: true,
      overnight: true,
    },
  ],
};

function parseArgs(): Args {
  let ticketNumber = DEFAULT_TICKET;
  let email = process.env.SEED_USER_EMAIL?.trim() || DEFAULT_EMAIL;
  let dryRun = false;
  let clean = false;

  for (const arg of process.argv.slice(2)) {
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--clean') clean = true;
    else if (arg.startsWith('--email=')) email = arg.slice(8).trim();
    else if (arg.startsWith('--ticket=')) ticketNumber = Number(arg.slice(9));
  }

  if (!Number.isFinite(ticketNumber) || ticketNumber <= 0) {
    throw new Error('Número de ticket inválido.');
  }

  return { ticketNumber, email, dryRun, clean };
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(total: number): string {
  const normalized = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function isWeekend(date: string): boolean {
  const day = new Date(`${date}T12:00:00`).getDay();
  return day === 0 || day === 6;
}

function dayStartMinutes(date: string): number {
  const dom = Number(date.slice(8, 10));
  return (dom % 2 === 1 ? 9 : 8) * 60;
}

function lunchMinutes(date: string): number {
  const dom = Number(date.slice(8, 10));
  const options = [20, 40, 50, 60, 30, 45];
  return options[dom % options.length];
}

function scheduleDay(date: string, tasks: RawTask[], ticketNumber: number): PlannedRow[] {
  const weekend = isWeekend(date);
  const rows: PlannedRow[] = [];

  const normalQueue: RawTask[] = [];
  const heQueue: RawTask[] = [];

  for (const task of tasks) {
    if (weekend || task.he) {
      heQueue.push(task);
    } else {
      normalQueue.push(task);
    }
  }

  let cursor = dayStartMinutes(date);
  let workSinceBreak = 0;

  const append = (task: RawTask, serviceName: 'HORA NORMAL' | 'HORA EXTRA') => {
    if (task.overnight) {
      cursor = Math.max(cursor, 22 * 60);
    }

    const initTime = minutesToTime(cursor);
    const endCursor = task.overnight
      ? cursor + task.minutes
      : cursor + task.minutes;
    const endTime = minutesToTime(endCursor);

    rows.push({
      date,
      initTime,
      endTime,
      description: task.description,
      serviceName,
      ticketNumber,
    });

    cursor = endCursor;
    workSinceBreak += task.minutes;
  };

  for (const task of normalQueue) {
    if (workSinceBreak >= 210) {
      cursor += lunchMinutes(date);
      workSinceBreak = 0;
    }

    if (cursor + task.minutes > 19 * 60) {
      heQueue.push(task);
      continue;
    }

    append(task, 'HORA NORMAL');
  }

  if (heQueue.length > 0) {
    if (!weekend) {
      cursor = Math.max(cursor, 19 * 60);
    } else if (rows.length === 0) {
      cursor = dayStartMinutes(date);
    }

    workSinceBreak = 0;
    for (const task of heQueue) {
      if (!weekend && !task.overnight && cursor < 19 * 60) {
        cursor = 19 * 60;
      }
      append(task, 'HORA EXTRA');
    }
  }

  return rows;
}

function rowDurationMinutes(row: PlannedRow): number {
  let start = timeToMinutes(row.initTime);
  let end = timeToMinutes(row.endTime);
  if (end <= start) end += 24 * 60;
  return end - start;
}

function allPlannedRows(ticketNumber: number): PlannedRow[] {
  const dates = Object.keys(TASKS_BY_DATE).sort();
  return dates.flatMap((date) =>
    scheduleDay(date, TASKS_BY_DATE[date], ticketNumber),
  );
}

function allDescriptions(): string[] {
  return Object.values(TASKS_BY_DATE)
    .flat()
    .map((task) => task.description);
}

async function main() {
  const args = parseArgs();
  const planned = allPlannedRows(args.ticketNumber);
  const descriptions = allDescriptions();

  const user = await prisma.user.findFirst({
    where: { email: { equals: args.email, mode: 'insensitive' }, deletedAt: null },
    select: { id: true, name: true, email: true },
  });
  if (!user) {
    throw new Error(`Usuário não encontrado: ${args.email}`);
  }

  const ticket = await prisma.portalTicket.findUnique({
    where: { ticketNumber: args.ticketNumber },
    select: { ticketNumber: true, title: true },
  });
  if (!ticket) {
    throw new Error(`Ticket #${args.ticketNumber} não encontrado no portal.`);
  }

  console.log('========== APONTAMENTOS 25–31/08/2026 ==========');
  console.log(`Ticket: #${ticket.ticketNumber} — ${ticket.title ?? '(sem título)'}`);
  console.log(`Usuário: ${user.name} <${user.email}>`);
  console.log(`Modo: ${args.dryRun ? 'DRY-RUN' : 'INSERT'}`);
  console.log(`Blocos planejados: ${planned.length}`);

  if (args.clean) {
    const toDelete = await prisma.portalTicketAppointment.count({
      where: {
        ticketNumber: args.ticketNumber,
        createdBy: user.id,
        description: { in: descriptions },
      },
    });
    console.log(`\nLimpeza: ${toDelete} apontamento(s) com as mesmas descrições.`);
    if (!args.dryRun && toDelete > 0) {
      await prisma.portalTicketAppointment.deleteMany({
        where: {
          ticketNumber: args.ticketNumber,
          createdBy: user.id,
          description: { in: descriptions },
        },
      });
    }
  }

  const existing = await prisma.portalTicketAppointment.findMany({
    where: {
      ticketNumber: args.ticketNumber,
      createdBy: user.id,
      appointmentDate: {
        gte: new Date('2026-08-25T00:00:00.000Z'),
        lte: new Date('2026-08-31T23:59:59.999Z'),
      },
    },
    select: { description: true },
  });

  const existingDesc = new Set(
    existing.map((row) => row.description.trim().toLowerCase()),
  );

  const toInsert = planned.filter(
    (row) => !existingDesc.has(row.description.trim().toLowerCase()),
  );

  const totalMinutes = toInsert.reduce((acc, row) => acc + rowDurationMinutes(row), 0);
  const normalMinutes = toInsert
    .filter((row) => row.serviceName === 'HORA NORMAL')
    .reduce((acc, row) => acc + rowDurationMinutes(row), 0);
  const extraMinutes = totalMinutes - normalMinutes;

  console.log(`\nA inserir: ${toInsert.length} | Já existentes (skip): ${planned.length - toInsert.length}`);
  console.log(
    `Totais novos: ${Math.floor(totalMinutes / 60)}h${String(totalMinutes % 60).padStart(2, '0')} (normal ${Math.floor(normalMinutes / 60)}h${String(normalMinutes % 60).padStart(2, '0')} + extra ${Math.floor(extraMinutes / 60)}h${String(extraMinutes % 60).padStart(2, '0')})`,
  );

  console.log('\nAgenda gerada:');
  for (const row of planned) {
    const skip = existingDesc.has(row.description.trim().toLowerCase());
    console.log(
      `  ${skip ? '[skip] ' : ''}${row.date} ${row.initTime}-${row.endTime} [${row.serviceName}] ${row.description}`,
    );
  }

  if (args.dryRun) {
    console.log('\nDry-run: nenhum registro gravado.');
    return;
  }

  if (toInsert.length === 0) {
    console.log('\nNada novo para inserir.');
    return;
  }

  await prisma.portalTicketAppointment.createMany({
    data: toInsert.map((row) => ({
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

  console.log(`\nInseridos ${toInsert.length} apontamentos no ticket #${args.ticketNumber}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
