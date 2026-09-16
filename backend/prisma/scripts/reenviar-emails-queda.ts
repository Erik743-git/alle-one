/**
 * Reenvia os e-mails que o SMTP recusou (535 5.7.3) entre a troca do MFA da
 * conta de suporte e a virada do envio para o Microsoft Graph.
 *
 * Uso (na pasta backend, depois do `npm run build`):
 *   npx ts-node --transpile-only prisma/scripts/reenviar-emails-queda.ts --ate=<ISO>            # só lista
 *   npx ts-node --transpile-only prisma/scripts/reenviar-emails-queda.ts --ate=<ISO> --enviar   # envia
 *
 *   --ate     momento em que o envio pelo Graph foi ligado (obrigatório, ISO UTC)
 *   --desde   início da queda (padrão: logo após o último envio aceito pelo SMTP)
 *   --logs    pasta dos logs do PM2 (padrão: ~/.pm2/logs)
 *
 * O que entra:
 *  - aviso de chamado registrado: cada chamado com falha no log;
 *  - aviso de apontamento: cada falha do log casada, pelo histórico do
 *    chamado, com o apontamento criado ou editado naquele instante;
 *  - e-mail de automação (ex.: fechamento): execuções FAILED por 535 no
 *    banco. Só as ações SEND_EMAIL são refeitas — as outras ações da regra
 *    não são repetidas, e as que ficaram sem rodar aparecem no relatório;
 *  - redefinição de senha não tem reenvio (o código expira): o relatório
 *    lista quem pediu e ainda não redefiniu.
 *
 * O conteúdo é montado pelos mesmos serviços do portal (com imagens e
 * anexos), a partir do estado atual do chamado. Cada envio feito vai para
 * cutover-logs/reenvio-emails-enviados.jsonl e é pulado se o script rodar
 * de novo.
 */
import 'dotenv/config';
import {
  appendFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { NestFactory } from '@nestjs/core';
import { SchedulerRegistry } from '@nestjs/schedule';
import type { AppModule as AppModuleType } from '../../src/app.module';
import type { EmailTemplatesService as EmailTemplatesServiceType } from '../../src/modules/mail/email-templates.service';
import type { PermissionsService as PermissionsServiceType } from '../../src/modules/permissions/permissions.service';
import type { TicketAutomationService as TicketAutomationServiceType } from '../../src/modules/tickets/ticket-automation.service';
import type { TicketAutomationAction } from '../../src/modules/tickets/ticket-automation.types';
import type { TicketsAppointmentsService as TicketsAppointmentsServiceType } from '../../src/modules/tickets/tickets-appointments.service';
import type { PrismaService as PrismaServiceType } from '../../src/prisma/prisma.service';

// Classes vêm do build (dist), o mesmo código que roda em produção: o
// contêiner do Nest só acha o serviço pela classe exata que registrou.
const fromDist = <T>(file: string): T =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require(resolve(__dirname, '../../dist/src', file)) as T;

// Qualquer valor diferente de "0" desliga os jobs agendados (abertura de
// rotinas, poller de e-mail, automações por inatividade) dentro do script.
process.env.NODE_APP_INSTANCE = 'reenvio-emails';

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    return [key, rest.length ? rest.join('=') : 'true'] as const;
  }),
);
const ENVIAR = args.get('enviar') === 'true';
const desde = new Date(args.get('desde') ?? '2026-09-14T19:50:18Z');
const ate = new Date(args.get('ate') ?? '');
const logsDir = args.get('logs') ?? join(homedir(), '.pm2', 'logs');
const outDir = resolve('cutover-logs');
const enviadosFile = join(outDir, 'reenvio-emails-enviados.jsonl');
/** Exchange Online aceita ~30 mensagens/min por remetente; a API também envia. */
const PAUSA_MS = 3000;

type TipoFalha =
  | 'TICKET_REGISTERED'
  | 'APPOINTMENT_CLIENT_NOTIFY'
  | 'GMUD_NOTIFY'
  | 'REDEFINICAO'
  | 'SUPORTE';
type FalhaLog = { tipo: TipoFalha; ref: string; em: Date };
/** Linhas de falha cuja data não foi reconhecida — não pode passar calado. */
let linhasSemData = 0;

type ItemReenvio = {
  chave: string;
  tipo: 'Chamado registrado' | 'Apontamento' | 'Automação';
  ticket: number;
  resumo: string;
  enviar: () => Promise<boolean>;
};

const NEST_TS =
  /\[Nest\]\s+\d+\s+-\s*(\d{2})\/(\d{2})\/(\d{4}),\s*(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)/;

/** O processo roda em UTC na VM, e o Nest escreve no formato en-US. */
function parseNestTimestamp(line: string): Date | null {
  const m = NEST_TS.exec(line);
  if (!m) return null;
  let hour = Number(m[4]) % 12;
  if (m[7] === 'PM') hour += 12;
  return new Date(
    Date.UTC(
      Number(m[3]),
      Number(m[1]) - 1,
      Number(m[2]),
      hour,
      Number(m[5]),
      Number(m[6]),
    ),
  );
}

async function lerFalhasDoLog(): Promise<FalhaLog[]> {
  const arquivos = readdirSync(logsDir).filter((f) =>
    /^alleone-api-(out|error)-\d+\.log$/.test(f),
  );
  const falhas: FalhaLog[] = [];
  for (const arquivo of arquivos) {
    const rl = createInterface({
      input: createReadStream(join(logsDir, arquivo)),
      crlfDelay: Infinity,
    });
    for await (const raw of rl) {
      if (!raw.includes('Falha ao enviar')) continue;
      // O Nest grava as cores do terminal no arquivo do PM2.
      // eslint-disable-next-line no-control-regex
      const line = raw.replace(/\x1b\[[0-9;]*m/g, '');
      const em = parseNestTimestamp(line);
      if (!em) {
        linhasSemData += 1;
        continue;
      }
      if (em < desde || em > ate) continue;

      const template =
        /Falha ao enviar (TICKET_REGISTERED|APPOINTMENT_CLIENT_NOTIFY|GMUD_NOTIFY) #(\S+?):/.exec(
          line,
        );
      if (template) {
        if (line.includes('535')) {
          falhas.push({ tipo: template[1] as TipoFalha, ref: template[2], em });
        }
        continue;
      }
      // O motivo destes vai na linha seguinte; dentro da janela o SMTP
      // recusava tudo, então a linha basta.
      const redefinicao =
        /Falha ao enviar e-mail de redefinição para (\S+@\S+?)\.?\s*$/.exec(line);
      if (redefinicao) {
        falhas.push({ tipo: 'REDEFINICAO', ref: redefinicao[1], em });
        continue;
      }
      if (line.includes('Falha ao enviar e-mail de suporte')) {
        falhas.push({ tipo: 'SUPORTE', ref: '', em });
      }
    }
  }
  return falhas.sort((a, b) => a.em.getTime() - b.em.getTime());
}

function lerJaEnviados(): Set<string> {
  if (!existsSync(enviadosFile)) return new Set();
  return new Set(
    readFileSync(enviadosFile, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => (JSON.parse(line) as { chave: string }).chave),
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fmt = (d: Date) =>
  d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

async function main() {
  if (Number.isNaN(desde.getTime()) || Number.isNaN(ate.getTime())) {
    console.error(
      'Informe --ate=<momento em que o Graph foi ligado, ISO UTC>. Ex.: --ate=2026-09-16T13:40:00Z',
    );
    process.exit(2);
  }
  if (ate <= desde) {
    console.error('--ate precisa ser depois de --desde.');
    process.exit(2);
  }
  if (ENVIAR && process.env.MAIL_TRANSPORT?.trim() !== 'graph') {
    console.error(
      'MAIL_TRANSPORT=graph não está no .env — o reenvio sairia pelo SMTP, que está recusando.',
    );
    process.exit(2);
  }

  console.log(
    `Janela: ${fmt(desde)} → ${fmt(ate)} (Brasília) | modo: ${ENVIAR ? 'ENVIO' : 'simulação (use --enviar para mandar)'}`,
  );
  const falhas = await lerFalhasDoLog();
  mkdirSync(outDir, { recursive: true });
  const jaEnviados = lerJaEnviados();

  const { AppModule } = fromDist<{ AppModule: typeof AppModuleType }>(
    'app.module',
  );
  const { PrismaService } = fromDist<{
    PrismaService: typeof PrismaServiceType;
  }>('prisma/prisma.service');
  const { EmailTemplatesService } = fromDist<{
    EmailTemplatesService: typeof EmailTemplatesServiceType;
  }>('modules/mail/email-templates.service');
  const { TicketsAppointmentsService } = fromDist<{
    TicketsAppointmentsService: typeof TicketsAppointmentsServiceType;
  }>('modules/tickets/tickets-appointments.service');
  const { TicketAutomationService } = fromDist<{
    TicketAutomationService: typeof TicketAutomationServiceType;
  }>('modules/tickets/ticket-automation.service');
  const { PermissionsService } = fromDist<{
    PermissionsService: typeof PermissionsServiceType;
  }>('modules/permissions/permissions.service');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    // Segunda trava além do NODE_APP_INSTANCE: nada agendado roda aqui.
    const registry = app.get(SchedulerRegistry, { strict: false });
    for (const job of registry.getCronJobs().values()) void job.stop();
    for (const name of registry.getIntervals()) registry.deleteInterval(name);
    for (const name of registry.getTimeouts()) registry.deleteTimeout(name);

    const prisma = app.get(PrismaService, { strict: false });
    const templates = app.get(EmailTemplatesService, { strict: false });
    const appointments = app.get(TicketsAppointmentsService, {
      strict: false,
    });
    const automation = app.get(TicketAutomationService, { strict: false });
    const permissions = app.get(PermissionsService, { strict: false });

    const fila: ItemReenvio[] = [];
    const avisos: string[] = [];

    // --- Aviso de chamado registrado --------------------------------------
    const ticketsRegistrados = [
      ...new Set(
        falhas
          .filter((f) => f.tipo === 'TICKET_REGISTERED')
          .map((f) => Number(f.ref)),
      ),
    ].sort((a, b) => a - b);
    for (const ticketNumber of ticketsRegistrados) {
      const ticket = await prisma.portalTicket.findUnique({
        where: { ticketNumber },
        select: {
          title: true,
          requestorEmail: true,
          requestorName: true,
          clientName: true,
          createdAt: true,
        },
      });
      if (!ticket) {
        avisos.push(`#${ticketNumber}: chamado não existe mais — aviso de registro não reenviado.`);
        continue;
      }
      // Chamado aberto a partir de e-mail avisava o remetente, sem cópia.
      const pre = await prisma.preTicket.findFirst({
        where: { ticketNumber },
        select: { fromEmail: true, fromName: true, receivedAt: true },
      });
      const to = (pre?.fromEmail || ticket.requestorEmail || '').trim();
      if (!to) {
        avisos.push(`#${ticketNumber}: sem e-mail do solicitante — aviso de registro não reenviado.`);
        continue;
      }
      const cc = pre
        ? []
        : (
            await prisma.portalTicketWatcher.findMany({
              where: {
                ticketNumber,
                createdAt: {
                  lte: new Date(ticket.createdAt.getTime() + 2 * 60_000),
                },
              },
              select: { email: true },
            })
          ).map((w) => w.email);
      fila.push({
        chave: `TR:${ticketNumber}`,
        tipo: 'Chamado registrado',
        ticket: ticketNumber,
        resumo: `para ${to}${cc.length ? ` (+${cc.length} cópia)` : ''} — "${ticket.title ?? ''}"`,
        enviar: () =>
          templates.sendTicketRegistered({
            to,
            cc,
            ticketNumber,
            title: ticket.title ?? `Chamado #${ticketNumber}`,
            requestorName: pre?.fromName ?? ticket.requestorName,
            companyName: ticket.clientName,
            openedAt: pre?.receivedAt ?? ticket.createdAt,
          }),
      });
    }

    // --- Aviso de apontamento --------------------------------------------
    const apontamentosNaFila = new Set<string>();
    for (const falha of falhas.filter(
      (f) => f.tipo === 'APPOINTMENT_CLIENT_NOTIFY',
    )) {
      const ticketNumber = Number(falha.ref);
      const historico = await prisma.ticketHistory.findMany({
        where: {
          ticketNumber,
          occurredAt: {
            gte: new Date(falha.em.getTime() - 15 * 60_000),
            lte: new Date(falha.em.getTime() + 5_000),
          },
        },
        orderBy: { occurredAt: 'desc' },
        select: { payload: true, actorName: true },
      });
      const evento = historico.find(
        (h) =>
          typeof (h.payload as { portalAppointmentId?: unknown } | null)
            ?.portalAppointmentId === 'string',
      );
      if (!evento) {
        avisos.push(
          `#${ticketNumber}: falha de ${fmt(falha.em)} sem apontamento correspondente no histórico — conferir manualmente.`,
        );
        continue;
      }
      const appointmentId = (evento.payload as { portalAppointmentId: string })
        .portalAppointmentId;
      if (apontamentosNaFila.has(appointmentId)) continue;

      const apontamento = await prisma.portalTicketAppointment.findUnique({
        where: { id: appointmentId },
        include: { creator: { select: { id: true, name: true } } },
      });
      if (!apontamento) {
        avisos.push(`#${ticketNumber}: apontamento ${appointmentId} foi apagado depois — não reenviado.`);
        continue;
      }
      if (!apontamento.notifyClient) {
        avisos.push(`#${ticketNumber}: apontamento ${appointmentId} não pede mais aviso ao cliente — não reenviado.`);
        continue;
      }
      apontamentosNaFila.add(appointmentId);
      const date = apontamento.appointmentDate.toISOString().slice(0, 10);
      const autor = evento.actorName?.trim() || apontamento.creator.name;
      fila.push({
        chave: `ACN:${appointmentId}`,
        tipo: 'Apontamento',
        ticket: ticketNumber,
        resumo: `${date.split('-').reverse().join('/')} ${apontamento.initTime}–${apontamento.endTime} por ${autor}`,
        enviar: async () => {
          const actor = await permissions.buildRequestUser(
            apontamento.creator.id,
            undefined,
            { skipTokenVersionCheck: true },
          );
          // Método interno do serviço: é ele que monta o e-mail real, com
          // imagens e anexos do apontamento e do chamado.
          const send = (
            appointments as unknown as {
              sendClientCommunicationEmail: (p: {
                ticketNumber: number;
                portalAppointmentId: string;
                actor: typeof actor;
                actorName: string;
                date: string;
                initTime: string;
                endTime: string;
                description: string;
              }) => Promise<boolean>;
            }
          ).sendClientCommunicationEmail.bind(appointments);
          return send({
            ticketNumber,
            portalAppointmentId: appointmentId,
            actor,
            actorName: autor,
            date,
            initTime: apontamento.initTime,
            endTime: apontamento.endTime,
            description: apontamento.description,
          });
        },
      });
    }

    // --- E-mails de automação (fechamento etc.) ---------------------------
    const execucoes = await prisma.ticketAutomationRun.findMany({
      where: { status: 'FAILED', createdAt: { gte: desde, lte: ate } },
      include: { rule: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const acoesNaoRefeitas: string[] = [];
    for (const run of execucoes) {
      const detail = run.detail as {
        message?: string;
        actions?: TicketAutomationAction[];
      } | null;
      if (!detail?.message?.includes('535')) continue;
      const actions = detail.actions ?? [];
      // A primeira ação de e-mail foi a que quebrou; as seguintes nem rodaram.
      const inicio = actions.findIndex((a) => a.type === 'SEND_EMAIL');
      if (inicio < 0) continue;
      const pendentes = actions
        .slice(inicio + 1)
        .filter((a) => a.type !== 'SEND_EMAIL')
        .map((a) => a.type);
      if (pendentes.length) {
        acoesNaoRefeitas.push(
          `#${run.ticketNumber} regra "${run.rule.name}": ${pendentes.join(', ')}`,
        );
      }
      actions.forEach((action, index) => {
        if (index < inicio || action.type !== 'SEND_EMAIL') return;
        fila.push({
          chave: `AUTO:${run.id}:${index}`,
          tipo: 'Automação',
          ticket: run.ticketNumber,
          resumo: `regra "${run.rule.name}" — assunto "${action.subject}"`,
          enviar: async () => {
            const apply = (
              automation as unknown as {
                applySendEmail: (
                  actor: unknown,
                  ticketNumber: number,
                  action: TicketAutomationAction,
                ) => Promise<void>;
              }
            ).applySendEmail.bind(automation);
            await apply(null, run.ticketNumber, action);
            return true;
          },
        });
      });
    }

    // --- Redefinição de senha (só relatório) -------------------------------
    const pedidos = await prisma.passwordResetToken.findMany({
      where: { createdAt: { gte: desde, lte: ate } },
      select: {
        userId: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const semRedefinir: string[] = [];
    for (const userId of new Set(pedidos.map((p) => p.userId))) {
      const redefiniu = await prisma.passwordResetToken.findFirst({
        where: { userId, usedAt: { gte: desde } },
        select: { id: true },
      });
      if (redefiniu) continue;
      const ultimo = pedidos.filter((p) => p.userId === userId).at(-1)!;
      semRedefinir.push(
        `${ultimo.user.name} <${ultimo.user.email}> — pediu em ${fmt(ultimo.createdAt)}`,
      );
    }

    // --- Relatório ----------------------------------------------------------
    const contar = (tipo: TipoFalha) =>
      falhas.filter((f) => f.tipo === tipo).length;
    console.log('\n=== O que o log registrou como recusado na janela ===');
    console.log(`Chamado registrado:        ${contar('TICKET_REGISTERED')} falha(s), ${ticketsRegistrados.length} chamado(s)`);
    console.log(`Aviso de apontamento:      ${contar('APPOINTMENT_CLIENT_NOTIFY')} falha(s)`);
    console.log(`Redefinição de senha:      ${contar('REDEFINICAO')} falha(s)`);
    console.log(`"Fale com o suporte":      ${contar('SUPORTE')} falha(s) — quem enviou viu erro na tela na hora`);
    console.log(`GMUD:                      ${contar('GMUD_NOTIFY')} falha(s) — não reenviado por este script`);
    if (linhasSemData > 0) {
      console.log(
        `\nATENÇÃO: ${linhasSemData} linha(s) de falha com data ilegível foram ignoradas — o formato do log mudou; não envie antes de corrigir.`,
      );
    }

    const porTipo = (tipo: ItemReenvio['tipo']) =>
      fila.filter((i) => i.tipo === tipo);
    console.log('\n=== Fila de reenvio ===');
    for (const tipo of ['Chamado registrado', 'Apontamento', 'Automação'] as const) {
      const itens = porTipo(tipo);
      console.log(`\n${tipo}: ${itens.length}`);
      for (const item of itens) {
        const marca = jaEnviados.has(item.chave) ? ' [já reenviado antes]' : '';
        console.log(`  #${item.ticket}  ${item.resumo}${marca}`);
      }
    }
    if (acoesNaoRefeitas.length) {
      console.log('\nAções de automação que ficaram sem rodar (NÃO são refeitas — conferir à mão):');
      for (const linha of acoesNaoRefeitas) console.log(`  ${linha}`);
    }
    if (avisos.length) {
      console.log('\nAvisos:');
      for (const linha of avisos) console.log(`  ${linha}`);
    }
    console.log(`\nRedefinição de senha — pediram na janela e ainda não redefiniram: ${semRedefinir.length}`);
    for (const linha of semRedefinir) console.log(`  ${linha}`);

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const relatorio = join(outDir, `reenvio-emails-${stamp}.json`);
    writeFileSync(
      relatorio,
      JSON.stringify(
        {
          modo: ENVIAR ? 'envio' : 'simulacao',
          desde,
          ate,
          falhasNoLog: falhas,
          fila: fila.map(({ enviar: _enviar, ...resto }) => ({
            ...resto,
            jaEnviado: jaEnviados.has(resto.chave),
          })),
          acoesNaoRefeitas,
          avisos,
          semRedefinir,
        },
        null,
        2,
      ),
    );
    console.log(`\nRelatório: ${relatorio}`);

    if (ENVIAR && linhasSemData > 0) {
      console.error('Envio cancelado: há falhas no log que não foram lidas.');
      process.exitCode = 1;
      return;
    }
    if (!ENVIAR) {
      console.log('\nSimulação: nada foi enviado. Rode de novo com --enviar.');
      return;
    }

    // --- Envio --------------------------------------------------------------
    const pendentes = fila.filter((i) => !jaEnviados.has(i.chave));
    console.log(`\nEnviando ${pendentes.length} e-mail(s), um a cada ${PAUSA_MS / 1000}s...`);
    let ok = 0;
    let erro = 0;
    for (const [n, item] of pendentes.entries()) {
      const prefixo = `[${n + 1}/${pendentes.length}] ${item.tipo} #${item.ticket}`;
      try {
        const enviado = await item.enviar();
        if (enviado) {
          ok += 1;
          appendFileSync(
            enviadosFile,
            `${JSON.stringify({ chave: item.chave, ticket: item.ticket, tipo: item.tipo, em: new Date().toISOString() })}\n`,
          );
          console.log(`  ✓ ${prefixo}`);
        } else {
          erro += 1;
          console.log(`  ✗ ${prefixo} — não enviado (motivo no aviso acima)`);
        }
      } catch (err) {
        erro += 1;
        console.log(
          `  ✗ ${prefixo} — ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      if (n < pendentes.length - 1) await sleep(PAUSA_MS);
    }
    console.log(`\nConcluído: ${ok} enviado(s), ${erro} com erro. Rodar de novo reenvia só os que faltaram.`);
    if (erro) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('FALHOU:', err instanceof Error ? err.stack : err);
  process.exit(1);
});
