/**
 * Corrige descrições de chamado que receberam blocos "Resposta por e-mail".
 *
 * Até esta versão, cada resposta por e-mail era COLADA no fim da descrição.
 * Em descrições no formato `__ALLEONE_DOC_V1__:` isso quebrava o JSON e a tela
 * passava a mostrar o texto cru (ex.: #81283). Agora a resposta vira
 * comunicação do ticket; este script leva os chamados antigos para o novo
 * formato.
 *
 * Uso (na pasta backend):
 *   npx ts-node --transpile-only prisma/scripts/corrigir-descricoes-resposta-email.ts            # só lista
 *   npx ts-node --transpile-only prisma/scripts/corrigir-descricoes-resposta-email.ts --aplicar  # aplica
 *   ... --ticket 81283   # só um chamado
 *
 * Para cada chamado com bloco colado:
 *  - confere que o fim da descrição é EXATAMENTE a sequência de blocos que o
 *    portal colou (um por e-mail registrado no histórico). Se não bater
 *    (alguém editou depois, etc.), não mexe e lista para conferir à mão;
 *  - devolve a descrição ao que era antes do primeiro bloco;
 *  - resposta de verdade vira comunicação (data/hora do e-mail, autor = nome e
 *    e-mail de quem mandou). Não duplica se rodar de novo;
 *  - aviso de "não entregue"/ausência é descartado (pré-ticket IGNORED,
 *    histórico e anexos soltos removidos, conversa de e-mail restaurada).
 * Antes de aplicar, grava backup das descrições em
 * prisma/scripts/backup-descricoes-<data>.json.
 */
import 'dotenv/config';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { PreTicketStatus, PrismaClient } from '@prisma/client';
import { createEmailReplyCommunication } from '../../src/modules/email-inbound/email-reply-communication';
import { detectAutomatedMessage } from '../../src/modules/email-inbound/email-inbound-ingest.service';

const APLICAR = process.argv.includes('--aplicar');
const ticketArg = process.argv.indexOf('--ticket');
const SO_TICKET =
  ticketArg >= 0 ? Number(process.argv[ticketArg + 1]) : undefined;

const MARCADOR = '<p><strong>Resposta por e-mail</strong>';

/** Igual ao escapeHtml que montou o bloco. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const fmt = (d: Date) =>
  d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

type PreTicketRow = {
  id: string;
  title: string;
  fromName: string | null;
  fromEmail: string;
  descriptionHtml: string | null;
  descriptionText: string | null;
  receivedAt: Date;
  conversationId: string | null;
  attachments: { fileId: string }[];
};

const CARIMBO = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

/**
 * Onde começa UM bloco (como applyEmailToOpenTicket montava) que termina
 * exatamente no fim de `texto`; -1 se não bater. Comparação de texto em vez
 * de regex: e-mails de aviso enormes estouravam o limite de regex.
 */
function inicioDoBlocoNoFim(texto: string, pre: PreTicketRow): number {
  const corpo =
    pre.descriptionHtml?.trim() ||
    `<pre>${escapeHtml(pre.descriptionText || '(sem conteúdo)')}</pre>`;
  const cauda = `</p>\n<p><em>${escapeHtml(pre.title)}</em></p>\n${corpo}`;
  if (!texto.endsWith(cauda)) return -1;
  const fimCarimbo = texto.length - cauda.length;
  const inicioCarimbo = fimCarimbo - 19;
  if (inicioCarimbo < 0) return -1;
  if (!CARIMBO.test(texto.slice(inicioCarimbo, fimCarimbo))) return -1;
  const antes = texto.slice(0, inicioCarimbo);
  const nomes = [...new Set([pre.fromName, pre.fromEmail].filter(Boolean))];
  for (const nome of nomes) {
    const cabeca = `<hr/>\n${MARCADOR} — ${escapeHtml(nome as string)} &lt;${escapeHtml(pre.fromEmail)}&gt; · `;
    if (antes.endsWith(cabeca)) return antes.length - cabeca.length;
  }
  return -1;
}

/**
 * Fim da descrição = exatamente os blocos, na ordem, separados por "\n".
 * Devolve a descrição original (antes do primeiro bloco) ou null.
 */
export function descricaoSemBlocos(
  texto: string,
  pres: PreTicketRow[],
): string | null {
  let resto = texto;
  for (let i = pres.length - 1; i >= 0; i--) {
    const inicio = inicioDoBlocoNoFim(resto, pres[i]);
    if (inicio < 0) return null;
    if (i === 0) {
      if (inicio === 0) return '';
      return resto[inicio - 1] === '\n' ? resto.slice(0, inicio - 1) : null;
    }
    if (inicio === 0 || resto[inicio - 1] !== '\n') return null;
    resto = resto.slice(0, inicio - 1);
  }
  return null;
}

async function main() {
  const prisma = new PrismaClient();
  const revisar: string[] = [];
  const backup: Array<{ ticketNumber: number; description: string }> = [];
  let corrigidos = 0;
  let comunicacoes = 0;
  let avisosDescartados = 0;

  try {
    const autorPadrao = await prisma.user.findFirst({
      where: { role: 'ADMIN', deletedAt: null, status: 'ACTIVE' },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!autorPadrao) throw new Error('Nenhum ADMIN ativo para autor técnico.');

    const descricoes = await prisma.portalTicketDescription.findMany({
      where: {
        description: { contains: MARCADOR },
        ...(SO_TICKET ? { ticketNumber: SO_TICKET } : {}),
      },
      select: { ticketNumber: true, description: true },
      orderBy: { ticketNumber: 'asc' },
    });
    console.log(
      `Chamados com resposta colada na descrição: ${descricoes.length} | modo: ${
        APLICAR ? 'APLICAR' : 'simulação (use --aplicar)'
      }`,
    );

    for (const { ticketNumber, description } of descricoes) {
      const atual = description ?? '';

      // E-mails aplicados a este chamado, na ordem em que foram colados.
      const historico = await prisma.ticketHistory.findMany({
        where: { ticketNumber, eventType: 'EMAIL_REPLY' },
        select: { externalKey: true },
        orderBy: { occurredAt: 'asc' },
      });
      const ids = historico
        .map((h) => h.externalKey?.replace(/^email:/, ''))
        .filter((v): v is string => Boolean(v));
      const preRows = await prisma.preTicket.findMany({
        where: { id: { in: ids } },
        include: { attachments: { select: { fileId: true } } },
      });
      const pres = ids
        .map((id) => preRows.find((p) => p.id === id))
        .filter((p): p is (typeof preRows)[number] => Boolean(p));

      const blocosNaDescricao = atual.split(`<hr/>\n${MARCADOR}`).length - 1;
      if (pres.length === 0 || pres.length !== blocosNaDescricao) {
        revisar.push(
          `#${ticketNumber} — ${blocosNaDescricao} bloco(s) na descrição, ${pres.length} e-mail(s) no histórico.`,
        );
        continue;
      }

      // O fim da descrição tem que ser exatamente a sequência de blocos.
      const original = descricaoSemBlocos(atual, pres);
      if (original === null) {
        revisar.push(
          `#${ticketNumber} — o fim da descrição não bate com os e-mails colados (editada depois?).`,
        );
        continue;
      }

      const respostas = pres.filter(
        (p) =>
          !detectAutomatedMessage({
            fromEmail: p.fromEmail,
            subject: p.title.replace(/^\[ignorado\]\s*/, ''),
            headers: [],
          }),
      );
      const avisos = pres.filter((p) => !respostas.includes(p));

      console.log(
        `  #${ticketNumber}: ${respostas.length} resposta(s) → comunicação, ${avisos.length} aviso(s) descartado(s)` +
          (original.startsWith('__ALLEONE_DOC_V1__:')
            ? ' [descrição formatada]'
            : ''),
      );
      for (const p of pres) {
        console.log(
          `      ${respostas.includes(p) ? 'comunicação' : 'descartar  '} ${fmt(p.receivedAt)} ${p.fromEmail} — ${p.title.slice(0, 60)}`,
        );
      }

      corrigidos += 1;
      comunicacoes += respostas.length;
      avisosDescartados += avisos.length;
      if (!APLICAR) continue;

      backup.push({ ticketNumber, description: atual });
      // Grava o backup antes de cada alteração (se cair no meio, não perde).
      writeFileSync(BACKUP_PATH, JSON.stringify(backup, null, 2));

      for (const p of respostas) {
        const autor = await prisma.user.findFirst({
          where: {
            email: { equals: p.fromEmail, mode: 'insensitive' },
            deletedAt: null,
          },
          select: { id: true, name: true },
        });
        await createEmailReplyCommunication(prisma, {
          ticketNumber,
          preTicketId: p.id,
          fromName:
            p.fromName && p.fromName !== p.fromEmail
              ? p.fromName
              : (autor?.name ?? null),
          fromEmail: p.fromEmail,
          html: p.descriptionHtml,
          text: p.descriptionText ?? '',
          receivedAt: p.receivedAt,
          authorUserId: autor?.id ?? autorPadrao.id,
        });
      }

      // Conversa de e-mail: se a atual veio de um aviso, volta para a do
      // último e-mail de verdade.
      const ticket = await prisma.portalTicket.findUnique({
        where: { ticketNumber },
        select: { emailConversationId: true },
      });
      const conversaDeAviso = avisos.some(
        (a) =>
          a.conversationId && a.conversationId === ticket?.emailConversationId,
      );
      let conversa: string | null | undefined;
      if (conversaDeAviso) {
        const avisoIds = avisos.map((a) => a.id);
        const real = await prisma.preTicket.findFirst({
          where: {
            ticketNumber,
            id: { notIn: avisoIds },
            conversationId: { not: null },
          },
          orderBy: { receivedAt: 'desc' },
          select: { conversationId: true },
        });
        conversa = real?.conversationId ?? null;
      }

      const avisoIds = avisos.map((a) => a.id);
      const avisoFiles = avisos.flatMap((a) =>
        a.attachments.map((x) => x.fileId),
      );
      await prisma.$transaction([
        prisma.portalTicketDescription.update({
          where: { ticketNumber },
          data: { description: original },
        }),
        prisma.ticketHistory.deleteMany({
          where: {
            ticketNumber,
            externalKey: { in: avisoIds.map((id) => `email:${id}`) },
          },
        }),
        prisma.portalTicketAppointmentAttachment.deleteMany({
          where: {
            ticketNumber,
            portalAppointmentId: null,
            fileId: { in: avisoFiles },
          },
        }),
        ...avisos.map((a) =>
          prisma.preTicket.update({
            where: { id: a.id },
            data: {
              status: PreTicketStatus.IGNORED,
              title: a.title.startsWith('[ignorado]')
                ? a.title
                : `[ignorado] ${a.title}`.slice(0, 500),
            },
          }),
        ),
        ...(conversa !== undefined
          ? [
              prisma.portalTicket.update({
                where: { ticketNumber },
                data: { emailConversationId: conversa },
              }),
            ]
          : []),
      ]);
    }

    console.log(
      `\nChamados corrigidos: ${corrigidos} | comunicações: ${comunicacoes} | avisos descartados: ${avisosDescartados}`,
    );
    if (APLICAR && backup.length) console.log(`Backup: ${BACKUP_PATH}`);
    if (revisar.length) {
      console.log('\nConferir à mão (nada foi alterado nestes):');
      for (const linha of revisar) console.log(`  ${linha}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

const BACKUP_PATH = join(
  __dirname,
  `backup-descricoes-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
);

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
