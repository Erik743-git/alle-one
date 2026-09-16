/**
 * Desfaz o que os avisos de "não entregue" do servidor de e-mail fizeram
 * antes de o portal passar a descartá-los na entrada.
 *
 * Uso (na pasta backend):
 *   npx ts-node --transpile-only prisma/scripts/limpar-avisos-nao-entrega.ts            # só lista
 *   npx ts-node --transpile-only prisma/scripts/limpar-avisos-nao-entrega.ts --aplicar  # aplica
 *
 * Para cada aviso:
 *  - se foi colado num chamado: remove da descrição exatamente o bloco
 *    "Resposta por e-mail" que o portal inseriu (sem casamento exato, não
 *    mexe e lista para revisão), apaga o registro do histórico, desvincula
 *    os anexos do aviso e devolve a conversa de e-mail que o chamado tinha;
 *  - em todos os casos: tira o aviso da fila de pré-tickets (IGNORED).
 * Automações "nova resposta" disparadas pelo aviso são só listadas.
 */
import 'dotenv/config';
import { PreTicketStatus, PrismaClient } from '@prisma/client';

const APLICAR = process.argv.includes('--aplicar');
const REMETENTE_AVISO = [
  { fromEmail: { startsWith: 'microsoftexchange', mode: 'insensitive' as const } },
  { fromEmail: { startsWith: 'postmaster@', mode: 'insensitive' as const } },
  { fromEmail: { startsWith: 'mailer-daemon@', mode: 'insensitive' as const } },
];

/** Igual ao escapeHtml do email-inbound-ingest.service, que montou o bloco. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const fmt = (d: Date) =>
  d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

async function main() {
  const prisma = new PrismaClient();
  const revisar: string[] = [];
  const automacoes: string[] = [];
  let removidosDaDescricao = 0;
  let tiradosDaFila = 0;

  try {
    const avisos = await prisma.preTicket.findMany({
      where: { OR: REMETENTE_AVISO, status: { not: PreTicketStatus.IGNORED } },
      orderBy: { receivedAt: 'asc' },
      include: { attachments: { select: { fileId: true } } },
    });
    console.log(
      `Avisos de não entrega ainda ativos: ${avisos.length} | modo: ${APLICAR ? 'APLICAR' : 'simulação (use --aplicar)'}`,
    );

    for (const aviso of avisos) {
      const ticketNumber = aviso.appliedToTicket ? aviso.ticketNumber : null;
      const rotulo = `${fmt(aviso.receivedAt)} ${aviso.title.slice(0, 70)}`;

      if (ticketNumber == null) {
        console.log(`  fila     ${rotulo}`);
        if (APLICAR) {
          await prisma.preTicket.update({
            where: { id: aviso.id },
            data: {
              status: PreTicketStatus.IGNORED,
              title: aviso.title.startsWith('[ignorado]')
                ? aviso.title
                : `[ignorado] ${aviso.title}`.slice(0, 500),
            },
          });
        }
        tiradosDaFila += 1;
        continue;
      }

      // O bloco exato que applyEmailToOpenTicket colou; só a hora é incerta.
      const nome = aviso.fromName ?? aviso.fromEmail;
      const corpo =
        aviso.descriptionHtml?.trim() ||
        `<pre>${escapeHtml(aviso.descriptionText || '(sem conteúdo)')}</pre>`;
      const bloco = new RegExp(
        '\\n?' +
          escapeRegExp(
            `<hr/>\n<p><strong>Resposta por e-mail</strong> — ${escapeHtml(nome)} &lt;${escapeHtml(aviso.fromEmail)}&gt; · `,
          ) +
          '\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}' +
          escapeRegExp(`</p>\n<p><em>${escapeHtml(aviso.title)}</em></p>\n${corpo}`),
      );

      const [descricao, ticket] = await Promise.all([
        prisma.portalTicketDescription.findUnique({
          where: { ticketNumber },
          select: { description: true },
        }),
        prisma.portalTicket.findUnique({
          where: { ticketNumber },
          select: { emailConversationId: true },
        }),
      ]);
      const atual = descricao?.description ?? '';
      const casou = bloco.test(atual);
      if (!casou) {
        revisar.push(
          `#${ticketNumber} — o texto do aviso de ${fmt(aviso.receivedAt)} não foi encontrado igual na descrição; conferir à mão.`,
        );
      }

      // Conversa que o chamado tinha antes: a do primeiro e-mail de verdade.
      let conversa: string | null | undefined;
      if (
        aviso.conversationId &&
        ticket?.emailConversationId === aviso.conversationId
      ) {
        const original = await prisma.preTicket.findFirst({
          where: {
            ticketNumber,
            id: { not: aviso.id },
            NOT: { OR: REMETENTE_AVISO },
          },
          orderBy: { receivedAt: 'asc' },
          select: { conversationId: true },
        });
        conversa = original?.conversationId ?? null;
      }

      const runs = await prisma.ticketAutomationRun.findMany({
        where: {
          ticketNumber,
          createdAt: {
            gte: new Date(aviso.receivedAt.getTime() - 60_000),
            lte: new Date(aviso.receivedAt.getTime() + 15 * 60_000),
          },
        },
        include: { rule: { select: { name: true, trigger: true } } },
      });
      for (const run of runs.filter((r) => r.rule.trigger === 'TICKET_NEW_REPLY')) {
        automacoes.push(
          `#${ticketNumber} regra "${run.rule.name}" (${run.status}) em ${fmt(run.createdAt)} — pode ter mudado o chamado; conferir.`,
        );
      }

      console.log(
        `  chamado  #${ticketNumber} ${casou ? 'bloco encontrado' : 'SEM casamento'}${conversa !== undefined ? ' | conversa restaurada' : ''} | ${aviso.attachments.length} anexo(s) — ${rotulo}`,
      );

      if (APLICAR) {
        const fileIds = aviso.attachments.map((a) => a.fileId);
        await prisma.$transaction([
          ...(casou
            ? [
                prisma.portalTicketDescription.update({
                  where: { ticketNumber },
                  data: { description: atual.replace(bloco, '') },
                }),
              ]
            : []),
          prisma.ticketHistory.deleteMany({
            where: { ticketNumber, externalKey: `email:${aviso.id}` },
          }),
          prisma.portalTicketAppointmentAttachment.deleteMany({
            where: {
              ticketNumber,
              portalAppointmentId: null,
              fileId: { in: fileIds },
            },
          }),
          ...(conversa !== undefined
            ? [
                prisma.portalTicket.update({
                  where: { ticketNumber },
                  data: { emailConversationId: conversa },
                }),
              ]
            : []),
          prisma.preTicket.update({
            where: { id: aviso.id },
            data: {
              status: PreTicketStatus.IGNORED,
              title: aviso.title.startsWith('[ignorado]')
                ? aviso.title
                : `[ignorado] ${aviso.title}`.slice(0, 500),
            },
          }),
        ]);
      }
      if (casou) removidosDaDescricao += 1;
    }

    console.log(
      `\nDescrições limpas: ${removidosDaDescricao} | só tirados da fila: ${tiradosDaFila}`,
    );
    if (revisar.length) {
      console.log('\nConferir à mão (descrição não foi alterada):');
      for (const linha of revisar) console.log(`  ${linha}`);
    }
    if (automacoes.length) {
      console.log('\nAutomações de "nova resposta" disparadas pelos avisos:');
      for (const linha of automacoes) console.log(`  ${linha}`);
    }
    if (!APLICAR) console.log('\nSimulação: nada foi alterado. Rode com --aplicar.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('FALHOU:', err instanceof Error ? err.stack : err);
  process.exit(1);
});
