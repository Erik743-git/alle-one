/**
 * Preenche apontamentos de rendimento com tarefas reais do período.
 *
 * Tickets fixos:
 *   #62866 — desenvolvimento do portal Alle One
 *   #75807 — integração Fluig (poucos apontamentos)
 *
 * Regras:
 *   - Seg–Sex: hora normal (6–9h), almoço 40–90 min entre blocos
 *   - Fim de semana trabalhado: somente HORA EXTRA
 *   - No máximo 2 dias com pouco tempo (alerta laranja)
 *   - Não repete descrições já existentes no banco
 *   - --clean remove apontamentos "Dev seed" e tickets criados pelo seed antigo
 *
 * Uso:
 *   npx ts-node prisma/scripts/seed-rendimento-month.ts --dry-run
 *   npx ts-node prisma/scripts/seed-rendimento-month.ts --year=2026 --month=8 --clean
 *   npx ts-node prisma/scripts/seed-rendimento-month.ts --email=voce@empresa.com --clean
 */
import 'dotenv/config';
import { PrismaClient, PortalTicketAppointmentSyncStatus } from '@prisma/client';

const TICKET_PORTAL = 62866;
const TICKET_FLUIG = 75807;

/** Títulos de tickets criados pelo seed antigo (serão removidos com --clean). */
const SEED_TICKET_TITLE_PATTERNS = [
  'Alle One —',
  'Millpar —',
];

const SEED_DESC_PREFIX = 'Dev seed';

const prisma = new PrismaClient();

type Args = {
  year: number;
  month: number;
  email: string;
  dryRun: boolean;
  clean: boolean;
};

type PlannedRow = {
  date: string;
  initTime: string;
  endTime: string;
  description: string;
  serviceName: 'HORA NORMAL' | 'HORA EXTRA';
  ticketNumber: number;
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
    throw new Error('Ano/mês inválidos.');
  }

  return { year, month, email, dryRun, clean };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function ymd(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function durationMinutes(init: string, end: string): number {
  return timeToMinutes(end) - timeToMinutes(init);
}

function monthRange(year: number, month: number): { from: Date; to: Date } {
  const lastDay = new Date(year, month, 0).getDate();
  return {
    from: new Date(`${ymd(year, month, 1)}T00:00:00.000Z`),
    to: new Date(`${ymd(year, month, lastDay)}T23:59:59.999Z`),
  };
}

/**
 * Plano agosto/2026 — tarefas alinhadas a commits e chats do período.
 * Fluig (#75807): poucos dias. Alerta de pouco tempo: dias 7 e 14.
 */
function buildPlan(year: number, month: number, todayYmd: string): PlannedRow[] {
  if (year !== 2026 || month !== 8) {
    throw new Error(
      'Plano detalhado só para agosto/2026. Ajuste buildPlan() para outro mês.',
    );
  }

  const P = TICKET_PORTAL;
  const F = TICKET_FLUIG;

  const rows: PlannedRow[] = [
    // 01 sáb — HE
    { date: ymd(year, month, 1), initTime: '09:00', endTime: '13:30', ticketNumber: P, serviceName: 'HORA EXTRA', description: 'Revisão do portal cliente multi-empresa e testes em homologação' },

    // 03 seg
    { date: ymd(year, month, 3), initTime: '08:00', endTime: '12:10', ticketNumber: P, serviceName: 'HORA NORMAL', description: 'Ajustes no formulário de abertura de ticket e templates de e-mail' },
    { date: ymd(year, month, 3), initTime: '13:00', endTime: '17:20', ticketNumber: P, serviceName: 'HORA NORMAL', description: 'Feedback de abertura de chamado e campos de cópia no e-mail' },

    // 04 ter
    { date: ymd(year, month, 4), initTime: '08:30', endTime: '12:00', ticketNumber: P, serviceName: 'HORA NORMAL', description: 'Portal cliente v3: packs e visão dual no dashboard' },
    { date: ymd(year, month, 4), initTime: '13:10', endTime: '17:40', ticketNumber: P, serviceName: 'HORA NORMAL', description: 'Multi-empresa no portal e presets de gráficos' },

    // 05 qua + HE noite
    { date: ymd(year, month, 5), initTime: '08:00', endTime: '12:20', ticketNumber: P, serviceName: 'HORA NORMAL', description: 'Financeiro: valor do contrato por especialidade' },
    { date: ymd(year, month, 5), initTime: '13:15', endTime: '17:05', ticketNumber: P, serviceName: 'HORA NORMAL', description: 'Relatório de fechamento com filtros multi-empresa' },
    { date: ymd(year, month, 5), initTime: '18:30', endTime: '20:00', ticketNumber: P, serviceName: 'HORA EXTRA', description: 'Testes do relatório de fechamento com dados reais' },

    // 06 qui
    { date: ymd(year, month, 6), initTime: '08:00', endTime: '12:00', ticketNumber: P, serviceName: 'HORA NORMAL', description: 'GMUD: reaprovacao ao editar solicitação já aprovada' },
    { date: ymd(year, month, 6), initTime: '13:00', endTime: '17:30', ticketNumber: P, serviceName: 'HORA NORMAL', description: 'Usuários cliente/gestor e permissões no portal' },

    // 07 sex — ALERTA (pouco tempo)
    { date: ymd(year, month, 7), initTime: '08:30', endTime: '13:15', ticketNumber: P, serviceName: 'HORA NORMAL', description: 'Correções pontuais na listagem de tickets pendentes' },

    // 08 sáb — HE Fluig
    { date: ymd(year, month, 8), initTime: '09:30', endTime: '13:00', ticketNumber: F, serviceName: 'HORA EXTRA', description: 'Análise da integração Fluig com solicitação de compra no PASOE' },

    // 10 seg — Fluig + portal
    { date: ymd(year, month, 10), initTime: '08:00', endTime: '11:30', ticketNumber: F, serviceName: 'HORA NORMAL', description: 'Ajuste na autenticação authProgressApp em homologação Fluig' },
    { date: ymd(year, month, 10), initTime: '13:00', endTime: '17:00', ticketNumber: P, serviceName: 'HORA NORMAL', description: 'Relatório de fechamento: formatação XLSX e filtros de excedente' },

    // 11 ter — Fluig
    { date: ymd(year, month, 11), initTime: '08:00', endTime: '10:30', ticketNumber: F, serviceName: 'HORA NORMAL', description: 'Teste do proxy e retorno da API Fluig em homologação' },
    { date: ymd(year, month, 11), initTime: '11:15', endTime: '17:10', ticketNumber: P, serviceName: 'HORA NORMAL', description: 'Ticket: solicitante rápido, editor rico e ciclo de vida' },

    // 12 qua
    { date: ymd(year, month, 12), initTime: '08:00', endTime: '12:15', ticketNumber: P, serviceName: 'HORA NORMAL', description: 'Histórico de reabrir/fechar ticket e validação de classificação' },
    { date: ymd(year, month, 12), initTime: '13:20', endTime: '17:45', ticketNumber: P, serviceName: 'HORA NORMAL', description: 'Rendimento: exibir título do ticket nos apontamentos' },

    // 13 qui
    { date: ymd(year, month, 13), initTime: '08:30', endTime: '12:30', ticketNumber: P, serviceName: 'HORA NORMAL', description: 'E-mail do ticket em thread e confirmação no ciclo de vida' },
    { date: ymd(year, month, 13), initTime: '13:40', endTime: '17:50', ticketNumber: P, serviceName: 'HORA NORMAL', description: 'Lista de tickets incluindo resolvidos e encerrados' },

    // 14 sex — ALERTA
    { date: ymd(year, month, 14), initTime: '09:00', endTime: '13:50', ticketNumber: P, serviceName: 'HORA NORMAL', description: 'Suporte e correções rápidas após deploy de GMUD' },

    // 15 sáb — HE
    { date: ymd(year, month, 15), initTime: '10:00', endTime: '14:00', ticketNumber: P, serviceName: 'HORA EXTRA', description: 'Zabbix: trocar filtro de cliente por grupo no tipo 4' },

    // 17 seg
    { date: ymd(year, month, 17), initTime: '08:00', endTime: '12:00', ticketNumber: P, serviceName: 'HORA NORMAL', description: 'Seguidores no chamado e layout do conteúdo do ticket' },
    { date: ymd(year, month, 17), initTime: '13:00', endTime: '17:35', ticketNumber: P, serviceName: 'HORA NORMAL', description: 'Financeiro e melhorias na tela de empresas' },

    // 18 ter + HE
    { date: ymd(year, month, 18), initTime: '08:00', endTime: '12:20', ticketNumber: P, serviceName: 'HORA NORMAL', description: 'Apontamento overnight e histórico do ticket' },
    { date: ymd(year, month, 18), initTime: '13:10', endTime: '17:25', ticketNumber: P, serviceName: 'HORA NORMAL', description: 'Flag de comunicação com cliente no apontamento' },
    { date: ymd(year, month, 18), initTime: '18:45', endTime: '20:15', ticketNumber: P, serviceName: 'HORA EXTRA', description: 'Headers de segurança no Nginx e cookie Secure em HTTPS' },

    // 19 qua
    { date: ymd(year, month, 19), initTime: '08:30', endTime: '12:30', ticketNumber: P, serviceName: 'HORA NORMAL', description: 'Abrir chamado no portal sem depender da API TiFlux' },
    { date: ymd(year, month, 19), initTime: '13:15', endTime: '17:40', ticketNumber: P, serviceName: 'HORA NORMAL', description: 'Editor de ticket: menus no tema escuro' },

    // 20 qui
    { date: ymd(year, month, 20), initTime: '08:00', endTime: '12:10', ticketNumber: P, serviceName: 'HORA NORMAL', description: 'Performance da listagem de apontamentos e dashboard' },
    { date: ymd(year, month, 20), initTime: '13:00', endTime: '17:20', ticketNumber: P, serviceName: 'HORA NORMAL', description: 'Roles CLIENT_GESTOR/CLIENT_MEMBER e migration de enum' },

    // 21 sex — Fluig último bloco
    { date: ymd(year, month, 21), initTime: '08:00', endTime: '10:00', ticketNumber: F, serviceName: 'HORA NORMAL', description: 'Reteste do fluxo de solicitação de compra Fluig após correção' },
    { date: ymd(year, month, 21), initTime: '10:50', endTime: '17:15', ticketNumber: P, serviceName: 'HORA NORMAL', description: 'Filtros salvos na lista de tickets com ordenação por coluna' },

    // 22 sáb — HE cutover
    { date: ymd(year, month, 22), initTime: '09:00', endTime: '13:30', ticketNumber: P, serviceName: 'HORA EXTRA', description: 'Cutover espelho TiFlux: sync inbound e ETL para portal canônico' },

    // 24 seg (hoje)
    { date: ymd(year, month, 24), initTime: '08:00', endTime: '12:15', ticketNumber: P, serviceName: 'HORA NORMAL', description: 'Automações de ticket por estágio, abertura e resposta' },
    { date: ymd(year, month, 24), initTime: '13:00', endTime: '17:10', ticketNumber: P, serviceName: 'HORA NORMAL', description: 'Catálogos por empresa e UX de abertura para cliente' },
    { date: ymd(year, month, 24), initTime: '17:30', endTime: '19:00', ticketNumber: P, serviceName: 'HORA EXTRA', description: 'Deploy em produção, migrations e cron do ETL' },
  ];

  return rows.filter((row) => row.date <= todayYmd);
}

async function cleanupBadSeed(userId: string, dryRun: boolean): Promise<void> {
  const seedTickets = await prisma.portalTicket.findMany({
    where: {
      OR: SEED_TICKET_TITLE_PATTERNS.map((prefix) => ({
        title: { startsWith: prefix },
      })),
      origin: 'PORTAL',
      createdBy: userId,
    },
    select: { ticketNumber: true, title: true },
  });

  const seedApptCount = await prisma.portalTicketAppointment.count({
    where: {
      OR: [
        { createdBy: userId, description: { startsWith: SEED_DESC_PREFIX } },
        ...(seedTickets.length
          ? [{ ticketNumber: { in: seedTickets.map((t) => t.ticketNumber) } }]
          : []),
      ],
    },
  });

  console.log(`Limpeza: ${seedApptCount} apontamento(s) seed, ${seedTickets.length} ticket(s) seed.`);

  if (dryRun) return;

  if (seedApptCount > 0) {
    await prisma.portalTicketAppointment.deleteMany({
      where: {
        OR: [
          { createdBy: userId, description: { startsWith: SEED_DESC_PREFIX } },
          ...(seedTickets.length
            ? [{ ticketNumber: { in: seedTickets.map((t) => t.ticketNumber) } }]
            : []),
        ],
      },
    });
  }

  for (const ticket of seedTickets) {
    const remaining = await prisma.portalTicketAppointment.count({
      where: { ticketNumber: ticket.ticketNumber },
    });
    if (remaining === 0) {
      await prisma.portalTicket.deleteMany({
        where: { ticketNumber: ticket.ticketNumber, origin: 'PORTAL' },
      });
      console.log(`  Removido ticket seed #${ticket.ticketNumber} — ${ticket.title}`);
    } else {
      console.log(
        `  Mantido ticket #${ticket.ticketNumber} (${remaining} apontamento(s) de outra origem)`,
      );
    }
  }
}

async function main() {
  const args = parseArgs();
  const { year, month, email, dryRun, clean } = args;
  const today = new Date();
  const todayYmd = ymd(today.getFullYear(), today.getMonth() + 1, today.getDate());
  const { from, to } = monthRange(year, month);

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' }, deletedAt: null },
    select: { id: true, name: true, email: true },
  });
  if (!user) throw new Error(`Usuário não encontrado: ${email}`);

  for (const num of [TICKET_PORTAL, TICKET_FLUIG]) {
    const ticket = await prisma.portalTicket.findUnique({
      where: { ticketNumber: num },
      select: { ticketNumber: true, title: true },
    });
    if (!ticket) {
      throw new Error(`Ticket #${num} não encontrado no portal.`);
    }
    console.log(`Ticket #${num}: ${ticket.title ?? '(sem título)'}`);
  }

  if (clean) {
    console.log('\n==> Limpando seed anterior...');
    await cleanupBadSeed(user.id, dryRun);
  }

  const existing = await prisma.portalTicketAppointment.findMany({
    where: {
      createdBy: user.id,
      appointmentDate: { gte: from, lte: to },
    },
    select: {
      ticketNumber: true,
      appointmentDate: true,
      initTime: true,
      endTime: true,
      description: true,
    },
  });

  const existingDesc = new Set(
    existing.map((row) => row.description.trim().toLowerCase()),
  );

  const overlaps = (
    ticket: number,
    date: string,
    init: string,
    end: string,
  ): boolean => {
    const start = timeToMinutes(init);
    const finish = timeToMinutes(end);
    return existing.some((row) => {
      const rowDate = row.appointmentDate.toISOString().slice(0, 10);
      if (row.ticketNumber !== ticket || rowDate !== date) return false;
      const rs = timeToMinutes(row.initTime);
      const rf = timeToMinutes(row.endTime);
      return start < rf && finish > rs;
    });
  };

  const planned = buildPlan(year, month, todayYmd);
  const toInsert: PlannedRow[] = [];

  for (const row of planned) {
    if (existingDesc.has(row.description.trim().toLowerCase())) {
      console.log(`  skip (desc existe): ${row.date} — ${row.description.slice(0, 50)}…`);
      continue;
    }
    if (overlaps(row.ticketNumber, row.date, row.initTime, row.endTime)) {
      console.log(`  skip (horário): ${row.date} ${row.initTime}-${row.endTime}`);
      continue;
    }
    toInsert.push(row);
  }

  const fluigCount = toInsert.filter((r) => r.ticketNumber === TICKET_FLUIG).length;
  const alertDays = new Set(
    planned
      .filter((r) => {
        const total = planned
          .filter((p) => p.date === r.date && p.serviceName === 'HORA NORMAL')
          .reduce((acc, p) => acc + durationMinutes(p.initTime, p.endTime), 0);
        return total > 0 && total < 360;
      })
      .map((r) => r.date),
  );

  console.log('\n========== RENDIMENTO ==========');
  console.log(`Usuário: ${user.name} <${user.email}>`);
  console.log(`Período: ${ymd(year, month, 1)} → ${todayYmd}`);
  console.log(`Planejados: ${planned.length} | A inserir: ${toInsert.length} | Já no banco: ${existing.length}`);
  console.log(`Fluig #${TICKET_FLUIG}: ${fluigCount} novo(s)`);
  console.log(`Dias com alerta de pouco tempo: ${[...alertDays].join(', ') || 'nenhum'}`);
  console.log(`Modo: ${dryRun ? 'DRY-RUN' : 'INSERT'}`);

  if (dryRun) {
    console.log('\nAmostra (primeiros 8):');
    for (const row of toInsert.slice(0, 8)) {
      console.log(
        `  ${row.date} ${row.initTime}-${row.endTime} [${row.serviceName}] #${row.ticketNumber} — ${row.description}`,
      );
    }
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

  console.log(`\nInseridos ${toInsert.length} apontamentos. Recarregue o calendário.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
