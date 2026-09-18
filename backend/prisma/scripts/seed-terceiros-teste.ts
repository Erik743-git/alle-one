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
  /** Empresas que o terceiro atende; a primeira é a empresa principal. */
  empresas: string[];
  mesa: string;
  /** Chamados por empresa. */
  ticketsPorEmpresa: number;
};

const PLANOS: Plano[] = [
  {
    // Atende mais de uma empresa: cobre o seletor do dashboard e da lista.
    email: 'terceiro.infra@teste.alletecnologia.com',
    nome: 'Terceiro Infra (teste)',
    empresas: ['Fluidra', 'ComFloresta'],
    mesa: 'Infraestrutura',
    ticketsPorEmpresa: 2,
  },
  {
    email: 'terceiro.sistema@teste.alletecnologia.com',
    nome: 'Terceiro Sistema (teste)',
    empresas: ['Ghelplus'],
    mesa: 'Sistemas',
    ticketsPorEmpresa: 2,
  },
];

const aplicar = process.argv.includes('--aplicar');
const limpar = process.argv.includes('--limpar');
const listarMesas = process.argv.includes('--mesas');

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
  if (listarMesas) {
    const mesas = await prisma.specialty.findMany({
      where: { deletedAt: null },
      select: { name: true, active: true },
      orderBy: { name: 'asc' },
    });
    console.log(
      mesas.map((m) => `${m.name}${m.active ? '' : ' (inativa)'}`).join('\n'),
    );
    return;
  }
  if (limpar) {
    await limparTudo();
    return;
  }

  const senhaHash = await bcrypt.hash(SENHA, 10);
  let proximoNumero = TICKET_NUMBER_BASE;
  const resumo: string[] = [];

  for (const plano of PLANOS) {
    const empresas = await prisma.company.findMany({
      where: { name: { in: plano.empresas }, deletedAt: null },
      select: { id: true, name: true, tifluxClientId: true },
    });
    const mesa = await prisma.specialty.findFirst({
      where: { name: plano.mesa, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!mesa) {
      console.error(
        `PULADO ${plano.email}: mesa "${plano.mesa}" não encontrada (rode com --mesas para ver os nomes).`,
      );
      continue;
    }
    const faltando = plano.empresas.filter(
      (nome) => !empresas.some((e) => e.name === nome),
    );
    if (faltando.length > 0) {
      console.error(
        `PULADO ${plano.email}: empresa(s) não encontrada(s): ${faltando.join(', ')}.`,
      );
      continue;
    }
    // Sem id de cliente o par empresa+mesa não fecha e o terceiro não veria nada.
    const semId = empresas.filter((e) => e.tifluxClientId == null);
    if (semId.length > 0) {
      console.error(
        `PULADO ${plano.email}: sem id de cliente em ${semId.map((e) => e.name).join(', ')}.`,
      );
      continue;
    }

    const totalTickets = empresas.length * plano.ticketsPorEmpresa;
    if (!aplicar) {
      resumo.push(
        `[simulação] ${plano.email} → ${empresas.map((e) => e.name).join(' + ')} / ${mesa.name}, ${totalTickets} chamado(s) a partir de #${proximoNumero}`,
      );
      proximoNumero += totalTickets;
      continue;
    }
    const principal = empresas.find((e) => e.name === plano.empresas[0])!;

    const user = await prisma.user.upsert({
      where: { email: plano.email },
      update: {
        name: plano.nome,
        // A senha entra também no update: sem isso, rodar o script de novo
        // deixava o usuário existente com a senha antiga.
        passwordHash: senhaHash,
        firstAccess: false,
        role: 'PJ',
        status: 'ACTIVE',
        responsible: true,
        specialtyId: mesa.id,
        companyId: principal.id,
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
        companyId: principal.id,
      },
      select: { id: true },
    });

    for (const empresa of empresas) {
      await prisma.userCompany.upsert({
        where: { userId_companyId: { userId: user.id, companyId: empresa.id } },
        update: { clientRole: 'CLIENT_MEMBER' },
        create: {
          userId: user.id,
          companyId: empresa.id,
          clientRole: 'CLIENT_MEMBER',
        },
      });
    }
    await prisma.userSpecialty.upsert({
      where: {
        userId_specialtyId: { userId: user.id, specialtyId: mesa.id },
      },
      update: {},
      create: { userId: user.id, specialtyId: mesa.id },
    });

    const respId = responsibleSyntheticId(user.id);
    const data = hoje();
    let hora = 8;

    for (const empresa of empresas) {
      for (let i = 0; i < plano.ticketsPorEmpresa; i += 1) {
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
        // Rodar o script de novo não duplica: cada chamado fica com o seu.
        const jaTem = await prisma.portalTicketAppointment.findFirst({
          where: { ticketNumber },
          select: { id: true },
        });
        hora += 1;
        if (jaTem) continue;
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
    }

    resumo.push(
      `${plano.email} (senha ${SENHA}) → ${empresas.map((e) => e.name).join(' + ')} / ${mesa.name}, chamados #${proximoNumero - totalTickets}..#${proximoNumero - 1}`,
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
