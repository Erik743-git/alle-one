import {
  PortalTicketAppointmentSyncStatus,
  type PrismaClient,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { isStaffRole } from '../permissions/company-pack.constants';
import { PORTAL_STAGE } from '../tickets/portal-ticket-stages';

/**
 * Resposta de cliente por e-mail vira COMUNICAÇÃO do ticket (hora início =
 * fim, marcada como atenção), em vez de ser colada na descrição.
 *
 * Colar na descrição quebrava descrições no formato `__ALLEONE_DOC_V1__:` (o
 * JSON deixava de ser válido e a tela mostrava o texto cru).
 */

const TIME_ZONE = 'America/Sao_Paulo';
/** Mesmo valor que a tela usa ao registrar uma comunicação. */
const COMMUNICATION_SERVICE_NAME = 'HORA NORMAL';
const COMMUNICATION_ATTENDANCE = 'Remote';

/** Data (YYYY-MM-DD) e hora (HH:mm) no fuso de Brasília. */
export function saoPauloDateTime(date: Date): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function emailReplyDescriptionHtml(params: {
  html: string | null;
  text: string;
}): string {
  const html = params.html?.trim();
  if (html) return html;
  return `<pre style="white-space:pre-wrap">${escapeHtml(
    params.text?.trim() || '(sem conteúdo)',
  )}</pre>`;
}

/**
 * Cria a comunicação a partir do pré-ticket do e-mail. Idempotente pelo
 * `sourcePreTicketId`: rodar de novo não duplica.
 * Retorna o id da comunicação (nova ou já existente).
 */
export async function createEmailReplyCommunication(
  prisma: PrismaClient,
  params: {
    ticketNumber: number;
    preTicketId: string;
    fromName: string | null;
    fromEmail: string;
    html: string | null;
    text: string;
    receivedAt: Date;
    /** Usuário do portal com esse e-mail; senão, o usuário técnico. */
    authorUserId: string;
  },
): Promise<{ id: string; created: boolean }> {
  const existing = await prisma.portalTicketAppointment.findUnique({
    where: { sourcePreTicketId: params.preTicketId },
    select: { id: true },
  });
  if (existing) return { id: existing.id, created: false };

  const when = saoPauloDateTime(params.receivedAt);
  const id = randomUUID();
  try {
    await prisma.portalTicketAppointment.create({
      data: {
        id,
        ticketNumber: params.ticketNumber,
        appointmentDate: new Date(`${when.date}T12:00:00.000Z`),
        initTime: when.time,
        endTime: when.time,
        description: emailReplyDescriptionHtml(params),
        serviceName: COMMUNICATION_SERVICE_NAME,
        attendance: COMMUNICATION_ATTENDANCE,
        // Não reenvia e-mail ao cliente com a própria mensagem dele (loop).
        notifyClient: false,
        isWarning: true,
        syncStatus: PortalTicketAppointmentSyncStatus.PORTAL_ONLY,
        createdBy: params.authorUserId,
        externalAuthorName: params.fromName?.trim().slice(0, 255) || null,
        externalAuthorEmail: params.fromEmail.slice(0, 255),
        sourcePreTicketId: params.preTicketId,
      },
    });
  } catch (err) {
    // Corrida com outra execução para o mesmo e-mail.
    if ((err as { code?: string })?.code === 'P2002') {
      const again = await prisma.portalTicketAppointment.findUnique({
        where: { sourcePreTicketId: params.preTicketId },
        select: { id: true },
      });
      if (again) return { id: again.id, created: false };
    }
    throw err;
  }

  // Anexos do e-mail passam a pertencer à comunicação.
  const preAttachments = await prisma.preTicketAttachment.findMany({
    where: { preTicketId: params.preTicketId },
    select: { fileId: true },
  });
  for (const att of preAttachments) {
    const linked = await prisma.portalTicketAppointmentAttachment.findFirst({
      where: { ticketNumber: params.ticketNumber, fileId: att.fileId },
      select: { id: true, portalAppointmentId: true },
    });
    if (linked) {
      // Versão antiga gravava o anexo solto no ticket; só vincula.
      if (!linked.portalAppointmentId) {
        await prisma.portalTicketAppointmentAttachment.update({
          where: { id: linked.id },
          data: { portalAppointmentId: id },
        });
      }
      continue;
    }
    await prisma.portalTicketAppointmentAttachment.create({
      data: {
        id: randomUUID(),
        ticketNumber: params.ticketNumber,
        portalAppointmentId: id,
        fileId: att.fileId,
        createdBy: params.authorUserId,
      },
    });
  }

  return { id, created: true };
}

export type ReplySender = {
  userId: string | null;
  role: string | null;
  companyId: string | null;
};

/**
 * Só reabre quando quem respondeu é do lado do cliente E tem relação com o
 * ticket. Sem isso, qualquer um que escrevesse "#12345" no assunto reabriria
 * um chamado de outra empresa.
 */
export async function senderCanReopenTicket(
  prisma: PrismaClient,
  params: {
    fromEmail: string;
    sender: ReplySender | null;
    routeCompanyId: string | null;
    ticket: {
      ticketNumber: number;
      requestorEmail: string | null;
      clientExternalId: number | null;
    };
  },
): Promise<boolean> {
  // Equipe interna responde e-mail, mas não reabre chamado por isso.
  if (params.sender?.role && isStaffRole(params.sender.role)) return false;
  return senderBelongsToTicket(prisma, params);
}

/**
 * Resposta por e-mail em chamado ABERTO só entra direto se o remetente tem
 * ligação com ele: equipe interna, solicitante, seguidor ou alguém da empresa
 * do chamado. Sem isso, qualquer pessoa que escrevesse "#número" no assunto
 * colocaria mensagem no chamado de outra empresa.
 */
export async function senderCanReplyToTicket(
  prisma: PrismaClient,
  params: Parameters<typeof senderCanReopenTicket>[1],
): Promise<boolean> {
  if (params.sender?.role && isStaffRole(params.sender.role)) return true;
  return senderBelongsToTicket(prisma, params);
}

async function senderBelongsToTicket(
  prisma: PrismaClient,
  params: Parameters<typeof senderCanReopenTicket>[1],
): Promise<boolean> {
  const email = params.fromEmail.trim().toLowerCase();
  if (!email) return false;

  if (params.ticket.requestorEmail?.trim().toLowerCase() === email) return true;

  const watcher = await prisma.portalTicketWatcher.findFirst({
    where: {
      ticketNumber: params.ticket.ticketNumber,
      email: { equals: email, mode: 'insensitive' },
    },
    select: { id: true },
  });
  if (watcher) return true;

  const clientId = params.ticket.clientExternalId;
  if (clientId == null) return false;

  const companyIds = new Set<string>();
  if (params.routeCompanyId) companyIds.add(params.routeCompanyId);
  if (params.sender?.companyId) companyIds.add(params.sender.companyId);
  if (params.sender?.userId) {
    const memberships = await prisma.userCompany.findMany({
      where: { userId: params.sender.userId },
      select: { companyId: true },
    });
    for (const m of memberships) companyIds.add(m.companyId);
  }
  if (companyIds.size === 0) return false;

  const match = await prisma.company.findFirst({
    where: {
      id: { in: [...companyIds] },
      tifluxClientId: clientId,
      deletedAt: null,
    },
    select: { id: true },
  });
  return Boolean(match);
}

/** Cancelado não reabre: só resolvido/encerrado. */
export function isReopenableStage(stageName: string | null): boolean {
  return (
    (stageName ?? '').trim().toLowerCase() !==
    PORTAL_STAGE.CANCELADO.toLowerCase()
  );
}

/** Reabre como a reabertura manual: volta para "Novo" e mantém o responsável. */
export async function reopenTicketFromEmail(
  prisma: PrismaClient,
  params: {
    ticketNumber: number;
    fromStageName: string | null;
    actorName: string;
    preTicketId: string;
  },
): Promise<boolean> {
  const updated = await prisma.portalTicket.updateMany({
    where: { ticketNumber: params.ticketNumber, isClosed: true },
    data: {
      isClosed: false,
      stageName: PORTAL_STAGE.NOVO,
      statusName: PORTAL_STAGE.NOVO,
      updatedAtSource: new Date(),
    },
  });
  if (updated.count === 0) return false;

  try {
    await prisma.ticketHistory.create({
      data: {
        id: randomUUID(),
        ticketNumber: params.ticketNumber,
        eventType: 'TICKET_REOPENED',
        summary: `Chamado reaberto por resposta de e-mail · estágio "${PORTAL_STAGE.NOVO}"`,
        actorName: params.actorName,
        source: 'PORTAL',
        occurredAt: new Date(),
        externalKey: `email_reopen:${params.preTicketId}`,
        payload: {
          fromStageName: params.fromStageName,
          toStageName: PORTAL_STAGE.NOVO,
          isClosed: false,
        },
      },
    });
  } catch {
    /* histórico não bloqueia */
  }
  return true;
}
