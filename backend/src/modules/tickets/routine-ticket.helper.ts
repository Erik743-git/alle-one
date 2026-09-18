import type { PrismaService } from '../../prisma/prisma.service';

/** Usuário técnico que abre os chamados das rotinas (ticket-auto-open). */
export const ROUTINE_AUTOMATION_USER_EMAIL =
  'automacao@alletecnologia.internal';

let automationUserIdCache: string | null | undefined;

async function automationUserId(prisma: PrismaService): Promise<string | null> {
  if (automationUserIdCache !== undefined) return automationUserIdCache;
  const user = await prisma.user.findUnique({
    where: { email: ROUTINE_AUTOMATION_USER_EMAIL },
    select: { id: true },
  });
  // Só guarda quando achou: a rotina cria o usuário na primeira execução.
  if (user) automationUserIdCache = user.id;
  return user?.id ?? null;
}

/**
 * Chamado aberto por rotina (abertura automática). Nesses chamados o cliente
 * não recebe aviso a cada apontamento; só o solicitante é avisado ao fechar.
 */
export async function isRoutineTicket(
  prisma: PrismaService,
  ticketNumber: number,
): Promise<boolean> {
  const [ticket, automationId] = await Promise.all([
    prisma.portalTicket.findUnique({
      where: { ticketNumber },
      select: { createdBy: true },
    }),
    automationUserId(prisma),
  ]);
  return Boolean(
    automationId && ticket?.createdBy && ticket.createdBy === automationId,
  );
}
