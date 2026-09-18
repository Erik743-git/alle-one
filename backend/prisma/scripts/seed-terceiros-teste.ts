/**
 * Cria terceiros (papel PJ) de teste com chamados e apontamentos próprios,
 * para conferir escopo, agenda e relatórios sem depender de dado real.
 *
 * Cada terceiro fica com uma empresa e uma mesa; os chamados nascem dentro
 * desse par e os apontamentos ficam no dia útil corrente, um por hora, para
 * a agenda não sobrepor.
 *
 * Uso (na VM, pasta backend, com .env do ambiente de TESTE):
 *   npx ts-node prisma/scripts/seed-terceiros-teste.ts            # simula
 *   npx ts-node prisma/scripts/seed-terceiros-teste.ts --aplicar
 *   npx ts-node prisma/scripts/seed-terceiros-teste.ts --limpar   # desfaz
 */
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import {
  PrismaClient,
  PortalTicketAppointmentSyncStatus,
  PortalTicketOrigin,
} from '@prisma/client';

const prisma = new PrismaClient();

/** Faixa de números reservada a estes chamados — some do caminho dos reais. */
const TICKET_NUMBER_BASE = 990_000;
const SENHA = 'Teste@123';

/** Marca no nome e na descrição, para o --limpar achar tudo de volta. */
const TAG = '[SEED-TERCEIRO]';

type Plano = {
  email: string;
  nome: string;
  empresa: string;
  mesa: string;
  /** Quantos chamados criar para este terceiro. */
  tickets: number;
};

const PLANOS: Plano[] = [
  {
    email: 'terceiro.infra@teste.alletecnologia.com',
    nome: 'Terceiro Infra (teste)',
    empresa: 'Fluidra',
    mesa: 'Infraestrutura',
    tickets: 3,
  },
  {
    email: 'terceiro.sistema@teste.alletecnologia.com',
    nome: 'Terceiro Sistema (teste)',
    empresa: 'ComFloresta',
    mesa: 'Sistema',
    tickets: 2,
  },
];

const aplicar = process.argv.includes('--aplicar');
const limpar = process.argv.includes('--limpar');

/** Id sintético do responsável — mesma conta de portal-responsible.helper.ts. */
function responsibleSyntheticId(userId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < userId.length; i += 1) {
    hash ^= userId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return 900_000_000 + ((hash >>> 0) % 90_000_000);
}

function hoje(): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d;
}

async function limparTudo() {
  const users = await prisma.user.findMany({
    where: { email: { in: PLANOS.map((p) => p.email) } },
    select: { id: true, email: true },
  });
  if (users.length === 0) {
    console.log('Nada a limpar.');
    return;
  }
  const ids = users.map((u) => u.id);
  const tickets = await prisma.portalTicket.findMany({
    where: { title: { startsWith: TAG } },
    select: { ticketNumber: true },
  });
  const numeros = tickets.map((t) => t.ticketNumber);

  const apont = await prisma.portalTicketAppointment.deleteMany({
    where: { ticketNumber: { in: numeros } },
  });
  const tk = await prisma.portalTicket.deleteMany({
    where: { ticketNumber: { in: numeros } },
  });
  await prisma.userSpecialty.deleteMany({ where: { userId: { in: ids } } });
  await prisma.userCompany.deleteMany({ where: { userId: { in: ids } } });
  const us = await prisma.user.deleteMany({ where: { id: { in: ids } } });
  console.log(
    `Removidos: ${us.count} usuário(s), ${tk.count} chamado(s), ${apont.count} apontamento(s).`,
  );
}

async function main() {
  if (limpar) {
    await limparTudo();
    return;
  }

  const senhaHash = await bcrypt.hash(SENHA, 10);
  let proximoNumero = TICKET_NUMBER_BASE;
  const resumo: string[] = [];

  for (const plano of PLANOS) {
    const empresa = await prisma.company.findFirst({
      where: { name: plano.empresa, deletedAt: null },
      select: { id: true, name: true, tifluxClientId: true },
    });
    const mesa = await prisma.specialty.findFirst({
      where: { name: plano.mesa, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!empresa || !mesa) {
      console.error(
        `PULADO ${plano.email}: ${!empresa ? `empresa "${plano.empresa}"` : `mesa "${plano.mesa}"`} não encontrada.`,
      );
      continue;
    }
    if (empresa.tifluxClientId == null) {
      console.error(
        `PULADO ${plano.email}: empresa "${empresa.name}" sem id de cliente — o escopo do terceiro não fecha.`,
      );
      continue;
    }

    if (!aplicar) {
      resumo.push(
        `[simulação] ${plano.email} → ${empresa.name} / ${mesa.name}, ${plano.tickets} chamado(s) a partir de #${proximoNumero}`,
      );
      proximoNumero += plano.tickets;
      continue;
    }

    const user = await prisma.user.upsert({
      where: { email: plano.email },
      update: {
        name: plano.nome,
        role: 'PJ',
        status: 'ACTIVE',
        responsible: true,
        specialtyId: mesa.id,
        companyId: empresa.id,
        deletedAt: null,
      },
      create: {
        name: plano.nome,
        email: plano.email,
        passwordHash: senhaHash,
        role: 'PJ',
        status: 'ACTIVE',
        firstAccess: false,
        responsible: true,
        specialtyId: mesa.id,
        companyId: empresa.id,
      },
      select: { id: true },
    });

    await prisma.userCompany.upsert({
      where: { userId_companyId: { userId: user.id, companyId: empresa.id } },
      update: { clientRole: 'CLIENT_MEMBER' },
      create: {
        userId: user.id,
        companyId: empresa.id,
        clientRole: 'CLIENT_MEMBER',
      },
    });
    await prisma.userSpecialty.upsert({
      where: {
        userId_specialtyId: { userId: user.id, specialtyId: mesa.id },
      },
      update: {},
      create: { userId: user.id, specialtyId: mesa.id },
    });

    const respId = responsibleSyntheticId(user.id);
    const data = hoje();

    for (let i = 0; i < plano.tickets; i += 1) {
      const ticketNumber = proximoNumero;
      proximoNumero += 1;

      await prisma.portalTicket.upsert({
        where: { ticketNumber },
        update: {},
        create: {
          ticketNumber,
          title: `${TAG} ${plano.mesa} ${i + 1} — ${empresa.name}`,
          clientName: empresa.name,
          clientExternalId: empresa.tifluxClientId,
          priorityName: 'Normal',
          statusName: 'Novo',
          stageName: 'Em Atendimento',
          responsibleExternalId: respId,
          responsibleName: plano.nome,
          deskName: mesa.name,
          specialtyId: mesa.id,
          requestorName: plano.nome,
          requestorEmail: plano.email,
          isClosed: false,
          origin: PortalTicketOrigin.PORTAL,
          createdAtSource: data,
          updatedAtSource: data,
          createdBy: user.id,
        },
      });

      // Um apontamento por chamado, uma hora cada, sem sobrepor a agenda.
      const hora = 8 + i;
      await prisma.portalTicketAppointment.create({
        data: {
          ticketNumber,
          appointmentDate: data,
          initTime: `${String(hora).padStart(2, '0')}:00`,
          endTime: `${String(hora + 1).padStart(2, '0')}:00`,
          description: `${TAG} Atendimento de teste ${i + 1} feito pelo terceiro.`,
          serviceName: mesa.name,
          attendance: 'HORA NORMAL',
          notifyClient: false,
          syncStatus: PortalTicketAppointmentSyncStatus.PORTAL_ONLY,
          createdBy: user.id,
        },
      });
    }

    resumo.push(
      `${plano.email} (senha ${SENHA}) → ${empresa.name} / ${mesa.name}, chamados #${proximoNumero - plano.tickets}..#${proximoNumero - 1}`,
    );
  }

  console.log(resumo.join('\n') || 'Nada feito.');
  if (!aplicar) console.log('\nSimulação. Rode com --aplicar para gravar.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
