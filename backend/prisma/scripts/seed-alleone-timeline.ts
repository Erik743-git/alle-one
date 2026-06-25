/**
 * Popula o projeto "alleone" (empresa Alle) com a linha do tempo
 * das entregas do portal — jun/2026.
 *
 * Uso: npx ts-node prisma/scripts/seed-alleone-timeline.ts
 */
import { PrismaClient, ProjectStatus } from '@prisma/client';

const prisma = new PrismaClient();

const PROJECT_ID = 'e8524592-71cc-4475-ae79-edfabf807bcd';
const COMPANY_ID = '62b3378c-d494-47c5-bde3-cce7f25dae0f';
const ERIK_USER_ID = '25324c56-6631-4fc1-85a9-bb2784954a46';

type ActivitySeed = {
  wbs: string;
  parentWbs: string | null;
  name: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  actualDurationDays: number;
  progressPercent: number;
  notes: string;
  predecessorWbs: string[];
  isMilestone?: boolean;
};

const ACTIVITIES: ActivitySeed[] = [
  {
    wbs: '1',
    parentWbs: null,
    name: 'Módulo Rendimento',
    startDate: '2026-06-23',
    endDate: '2026-06-24',
    durationDays: 2,
    actualDurationDays: 2,
    progressPercent: 100,
    notes: 'Correções de apontamento, justificativas e visor de horas. Total: ~9h.',
    predecessorWbs: [],
  },
  {
    wbs: '1.1',
    parentWbs: '1',
    name: 'Apontamento overnight (23h → 07h)',
    startDate: '2026-06-23',
    endDate: '2026-06-23',
    durationDays: 1,
    actualDurationDays: 1,
    progressPercent: 100,
    notes: 'Previsão: 3h | Realizado: 3h. Validação de horário cruzando meia-noite.',
    predecessorWbs: [],
  },
  {
    wbs: '1.2',
    parentWbs: '1',
    name: 'Justificativa voluntária vs alerta',
    startDate: '2026-06-23',
    endDate: '2026-06-23',
    durationDays: 1,
    actualDurationDays: 1,
    progressPercent: 100,
    notes: 'Previsão: 2h | Realizado: 2h. Minutos do alerta não revertem após aprovação.',
    predecessorWbs: ['1.1'],
  },
  {
    wbs: '1.3',
    parentWbs: '1',
    name: 'Horas normais, extras e ciclo 26–25',
    startDate: '2026-06-24',
    endDate: '2026-06-24',
    durationDays: 1,
    actualDurationDays: 1,
    progressPercent: 100,
    notes:
      'Previsão: 4h | Realizado: 4h. Linha "Normais (sem extra)" e período de hora extra corrigido.',
    predecessorWbs: ['1.2'],
  },
  {
    wbs: '2',
    parentWbs: null,
    name: 'Módulo Projetos (MVP)',
    startDate: '2026-06-24',
    endDate: '2026-06-27',
    durationDays: 4,
    actualDurationDays: 3,
    progressPercent: 85,
    notes: 'Cronograma, Gantt, Excel e CRUD. Total previsto: ~14h | Realizado: ~12h.',
    predecessorWbs: ['1'],
  },
  {
    wbs: '2.1',
    parentWbs: '2',
    name: 'Schema Prisma + API backend',
    startDate: '2026-06-24',
    endDate: '2026-06-24',
    durationDays: 1,
    actualDurationDays: 1,
    progressPercent: 100,
    notes: 'Previsão: 4h | Realizado: 4h. Tabelas Project/Activity, WBS e predecessores.',
    predecessorWbs: ['1.3'],
  },
  {
    wbs: '2.2',
    parentWbs: '2',
    name: 'Frontend cronograma, Gantt e Excel',
    startDate: '2026-06-24',
    endDate: '2026-06-25',
    durationDays: 2,
    actualDurationDays: 2,
    progressPercent: 100,
    notes: 'Previsão: 5h | Realizado: 5h. Telas por empresa, export/import planilha.',
    predecessorWbs: ['2.1'],
  },
  {
    wbs: '2.3',
    parentWbs: '2',
    name: 'Permissões e menu lateral',
    startDate: '2026-06-24',
    endDate: '2026-06-24',
    durationDays: 1,
    actualDurationDays: 1,
    progressPercent: 100,
    notes: 'Previsão: 1h | Realizado: 1h. Módulo PROJECTS no RBAC.',
    predecessorWbs: ['2.1'],
  },
  {
    wbs: '2.4',
    parentWbs: '2',
    name: 'Modal de atividades (UI)',
    startDate: '2026-06-25',
    endDate: '2026-06-25',
    durationDays: 1,
    actualDurationDays: 1,
    progressPercent: 100,
    notes: 'Previsão: 1h | Realizado: 1h. Redesign do formulário de nova/editar atividade.',
    predecessorWbs: ['2.2'],
  },
  {
    wbs: '2.5',
    parentWbs: '2',
    name: 'Homologação e correções',
    startDate: '2026-06-25',
    endDate: '2026-06-27',
    durationDays: 3,
    actualDurationDays: 1,
    progressPercent: 50,
    notes:
      'Previsão: 3h | Realizado: 1h. JSON duplicado corrigido; pendente: modelo Excel sem projeto.',
    predecessorWbs: ['2.4'],
  },
  {
    wbs: '3',
    parentWbs: null,
    name: 'Infraestrutura Cloudflare',
    startDate: '2026-06-25',
    endDate: '2026-06-25',
    durationDays: 1,
    actualDurationDays: 1,
    progressPercent: 100,
    notes: 'Diagnóstico e correção SSL/proxy. Total: ~4h (tarde inteira).',
    predecessorWbs: [],
  },
  {
    wbs: '3.1',
    parentWbs: '3',
    name: 'Diagnóstico erro 522 (proxy laranja)',
    startDate: '2026-06-25',
    endDate: '2026-06-25',
    durationDays: 1,
    actualDurationDays: 1,
    progressPercent: 100,
    notes: 'Previsão: 2h | Realizado: 2h. Scripts diagnose + verify origin.',
    predecessorWbs: [],
  },
  {
    wbs: '3.2',
    parentWbs: '3',
    name: 'SSL Full (Strict) + nginx origin',
    startDate: '2026-06-25',
    endDate: '2026-06-25',
    durationDays: 1,
    actualDurationDays: 1,
    progressPercent: 100,
    notes: 'Previsão: 2h | Realizado: 2h. HTTPS forçado, porta 80 fechada no origin.',
    predecessorWbs: ['3.1'],
  },
  {
    wbs: '4',
    parentWbs: null,
    name: 'Empresas e Zabbix',
    startDate: '2026-06-25',
    endDate: '2026-06-25',
    durationDays: 1,
    actualDurationDays: 1,
    progressPercent: 100,
    notes: 'Multi-grupos Zabbix e UI admin. Total: ~4h.',
    predecessorWbs: ['3'],
  },
  {
    wbs: '4.1',
    parentWbs: '4',
    name: 'Múltiplos grupos Zabbix por empresa',
    startDate: '2026-06-25',
    endDate: '2026-06-25',
    durationDays: 1,
    actualDurationDays: 1,
    progressPercent: 100,
    notes:
      'Previsão: 3h | Realizado: 3h. Lista separada por ; sem nova tabela; agregação dashboard.',
    predecessorWbs: [],
  },
  {
    wbs: '4.2',
    parentWbs: '4',
    name: 'UI admin empresas (layout + chips +N)',
    startDate: '2026-06-25',
    endDate: '2026-06-25',
    durationDays: 1,
    actualDurationDays: 1,
    progressPercent: 100,
    notes: 'Previsão: 1h | Realizado: 1h. Ícone desespremido e limite de 4 tags na tabela.',
    predecessorWbs: ['4.1'],
  },
  {
    wbs: '5',
    parentWbs: null,
    name: 'Módulo Tickets',
    startDate: '2026-06-24',
    endDate: '2026-06-25',
    durationDays: 2,
    actualDurationDays: 2,
    progressPercent: 100,
    notes: 'Descrição rica e análise SLA. Total: ~5h.',
    predecessorWbs: ['2.1'],
  },
  {
    wbs: '5.1',
    parentWbs: '5',
    name: 'Descrição rica com imagens na criação',
    startDate: '2026-06-24',
    endDate: '2026-06-25',
    durationDays: 2,
    actualDurationDays: 2,
    progressPercent: 100,
    notes:
      'Previsão: 4h | Realizado: 4h. PortalTicketDescription + composer igual apontamentos.',
    predecessorWbs: [],
  },
  {
    wbs: '5.2',
    parentWbs: '5',
    name: 'Análise SLA pausado (mesa sem valorização)',
    startDate: '2026-06-25',
    endDate: '2026-06-25',
    durationDays: 1,
    actualDurationDays: 1,
    progressPercent: 100,
    notes: 'Previsão: 1h | Realizado: 1h. Comportamento TiFlux documentado.',
    predecessorWbs: ['5.1'],
  },
  {
    wbs: '6',
    parentWbs: null,
    name: 'Homologação ambiente local',
    startDate: '2026-06-25',
    endDate: '2026-06-25',
    durationDays: 1,
    actualDurationDays: 1,
    progressPercent: 100,
    notes: 'Docker/Postgres, cache PWA, backend health. Total: ~2h.',
    predecessorWbs: ['2.5', '4.2', '5.2'],
    isMilestone: true,
  },
];

function toDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

async function main() {
  const project = await prisma.project.findFirst({
    where: { id: PROJECT_ID, companyId: COMPANY_ID, deletedAt: null },
  });
  if (!project) {
    throw new Error('Projeto alleone não encontrado para a empresa Alle.');
  }

  const erik = await prisma.user.findFirst({
    where: { id: ERIK_USER_ID, deletedAt: null },
  });
  if (!erik) {
    throw new Error('Usuário Erik Manarin não encontrado.');
  }

  await prisma.$transaction(async (tx) => {
    const existing = await tx.projectActivity.findMany({
      where: { projectId: PROJECT_ID },
      select: { id: true },
    });
    if (existing.length) {
      const ids = existing.map((row) => row.id);
      await tx.projectActivityPredecessor.deleteMany({
        where: {
          OR: [{ activityId: { in: ids } }, { predecessorId: { in: ids } }],
        },
      });
      await tx.projectActivity.deleteMany({ where: { projectId: PROJECT_ID } });
    }

    const idByWbs = new Map<string, string>();
    const parentIdByWbs = new Map<string, string | null>();

    for (const row of ACTIVITIES) {
      parentIdByWbs.set(row.wbs, row.parentWbs ? idByWbs.get(row.parentWbs) ?? null : null);
    }

    for (const row of ACTIVITIES) {
      const parentId = parentIdByWbs.get(row.wbs) ?? null;
      const level = row.wbs.split('.').length;
      const sortOrder = ACTIVITIES.filter(
        (item) => item.parentWbs === row.parentWbs,
      ).findIndex((item) => item.wbs === row.wbs);

      const created = await tx.projectActivity.create({
        data: {
          projectId: PROJECT_ID,
          parentId,
          wbsCode: row.wbs,
          name: row.name,
          level,
          sortOrder,
          durationDays: row.isMilestone ? 0 : row.durationDays,
          startDate: toDate(row.startDate),
          endDate: toDate(row.endDate),
          actualDurationDays: row.actualDurationDays,
          progressPercent: row.progressPercent,
          assigneeUserId: ERIK_USER_ID,
          isMilestone: Boolean(row.isMilestone),
          notes: row.notes,
        },
      });
      idByWbs.set(row.wbs, created.id);
    }

    for (const row of ACTIVITIES) {
      const activityId = idByWbs.get(row.wbs);
      if (!activityId) continue;
      for (const predWbs of row.predecessorWbs) {
        const predecessorId = idByWbs.get(predWbs);
        if (!predecessorId) continue;
        await tx.projectActivityPredecessor.create({
          data: { activityId, predecessorId },
        });
      }
    }

    await tx.project.update({
      where: { id: PROJECT_ID },
      data: {
        name: 'Portal AlleOne — Evoluções Jun/2026',
        description:
          'Linha do tempo das entregas do portal em homologação (rendimento, projetos, cloudflare, zabbix, tickets). Responsável: Erik Manarin.',
        status: ProjectStatus.IN_PROGRESS,
        startDate: toDate('2026-06-23'),
        endDate: toDate('2026-06-27'),
      },
    });
  });

  const count = await prisma.projectActivity.count({
    where: { projectId: PROJECT_ID, deletedAt: null },
  });
  console.log(`Timeline cadastrada: ${count} atividades no projeto alleone.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
