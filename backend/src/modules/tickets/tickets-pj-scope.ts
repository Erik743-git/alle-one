import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { portalResponsibleSyntheticId } from './portal-responsible.helper';

/**
 * Terceiro (papel PJ) é colaborador com alcance restrito: enxerga os chamados
 * das empresas associadas a ele **e** das mesas (especialidades) dele, além
 * dos chamados em que está envolvido. Sem empresa associada, vê só os dele.
 */
export type PjTicketScope = {
  /** Clientes (id externo) das empresas associadas ao terceiro. */
  clientExternalIds: number[];
  /** Mesas (especialidades) do terceiro. */
  specialtyIds: string[];
};

export function isPjRole(role: string | null | undefined): boolean {
  return role === 'PJ';
}

/** Escopo do terceiro; `null` para quem não é terceiro (sem restrição). */
export async function loadPjTicketScope(
  prisma: PrismaService,
  actor: AuthenticatedRequestUser,
): Promise<PjTicketScope | null> {
  if (!isPjRole(actor.role)) return null;

  const [companies, user] = await Promise.all([
    prisma.userCompany.findMany({
      where: { userId: actor.userId, company: { deletedAt: null } },
      select: { company: { select: { tifluxClientId: true } } },
    }),
    prisma.user.findUnique({
      where: { id: actor.userId },
      select: {
        specialtyId: true,
        userSpecialties: { select: { specialtyId: true } },
      },
    }),
  ]);

  const clientExternalIds = [
    ...new Set(
      companies
        .map((row) => row.company.tifluxClientId)
        .filter((id): id is number => id != null),
    ),
  ];
  const specialtyIds = [
    ...new Set(
      [
        user?.specialtyId ?? null,
        ...(user?.userSpecialties ?? []).map((row) => row.specialtyId),
      ].filter((id): id is string => Boolean(id)),
    ),
  ];

  return { clientExternalIds, specialtyIds };
}

/** Chamado "do terceiro": criou, é solicitante, responsável ou seguidor. */
function involvementOr(
  actor: AuthenticatedRequestUser,
  watcherTicketNumbers: number[],
): Prisma.PortalTicketWhereInput[] {
  const email = actor.email?.trim() ?? '';
  const or: Prisma.PortalTicketWhereInput[] = [{ createdBy: actor.userId }];
  if (email) {
    or.push({ requestorEmail: { equals: email, mode: 'insensitive' } });
  }
  if (watcherTicketNumbers.length > 0) {
    or.push({ ticketNumber: { in: watcherTicketNumbers } });
  }
  return or;
}

/**
 * Filtro da listagem para o terceiro. `responsibleExternalId` é o id do
 * terceiro como responsável (quando existe espelho local).
 */
export function pjTicketListWhere(params: {
  scope: PjTicketScope;
  actor: AuthenticatedRequestUser;
  responsibleExternalId: number | null;
  watcherTicketNumbers: number[];
}): Prisma.PortalTicketWhereInput {
  const or = involvementOr(params.actor, params.watcherTicketNumbers);
  if (params.responsibleExternalId != null) {
    or.push({ responsibleExternalId: params.responsibleExternalId });
  }
  const { clientExternalIds, specialtyIds } = params.scope;
  // A mesa manda: quem tem mesa vê a fila dela inteira, de qualquer empresa.
  // A empresa só define o alcance de quem não tem mesa nenhuma. Sem os dois,
  // sobra o envolvimento (criou, é solicitante, responsável ou seguidor).
  if (specialtyIds.length > 0) {
    or.push({ specialtyId: { in: specialtyIds } });
  } else if (clientExternalIds.length > 0) {
    or.push({ clientExternalId: { in: clientExternalIds } });
  }
  return { OR: or };
}

/**
 * Aplica o escopo do terceiro a um chamado pelo número. Não faz nada para
 * quem não é terceiro, nem para chamado sem espelho no portal (quem trata
 * essa ausência é o chamador).
 */
export async function assertPjAccessToTicketNumber(
  prisma: PrismaService,
  actor: AuthenticatedRequestUser,
  ticketNumber: number,
): Promise<void> {
  const scope = await loadPjTicketScope(prisma, actor);
  if (!scope) return;

  const ticket = await prisma.portalTicket.findUnique({
    where: { ticketNumber },
    select: {
      clientExternalId: true,
      specialtyId: true,
      createdBy: true,
      requestorEmail: true,
      responsibleExternalId: true,
    },
  });
  if (!ticket) return;

  const watcher = actor.email
    ? await prisma.portalTicketWatcher.findFirst({
        where: {
          ticketNumber,
          email: { equals: actor.email.trim().toLowerCase() },
        },
        select: { id: true },
      })
    : null;

  assertPjTicketScope({
    scope,
    actor,
    ticket,
    isWatcher: Boolean(watcher),
    responsibleExternalId: portalResponsibleSyntheticId(actor.userId),
  });
}

/** Mesmo critério da listagem, para abrir/alterar um chamado específico. */
export function assertPjTicketScope(params: {
  scope: PjTicketScope;
  actor: AuthenticatedRequestUser;
  ticket: {
    clientExternalId: number | null | undefined;
    specialtyId: string | null | undefined;
    createdBy?: string | null;
    requestorEmail?: string | null;
    responsibleExternalId?: number | null;
  };
  isWatcher?: boolean;
  responsibleExternalId?: number | null;
}): void {
  const { scope, actor, ticket } = params;
  if (ticket.createdBy && ticket.createdBy === actor.userId) return;
  const actorEmail = actor.email?.trim().toLowerCase() ?? '';
  const requestor = ticket.requestorEmail?.trim().toLowerCase() ?? '';
  if (actorEmail && requestor && actorEmail === requestor) return;
  if (params.isWatcher) return;
  if (
    params.responsibleExternalId != null &&
    ticket.responsibleExternalId != null &&
    Number(params.responsibleExternalId) ===
      Number(ticket.responsibleExternalId)
  ) {
    return;
  }
  // Mesmo critério da listagem: a mesa manda; a empresa só vale para quem
  // não tem mesa nenhuma.
  if (scope.specialtyIds.length > 0) {
    if (
      ticket.specialtyId &&
      scope.specialtyIds.includes(String(ticket.specialtyId))
    ) {
      return;
    }
    throw new ForbiddenException('Chamado fora das mesas que você atende.');
  }

  if (
    scope.clientExternalIds.length > 0 &&
    ticket.clientExternalId != null &&
    scope.clientExternalIds.includes(Number(ticket.clientExternalId))
  ) {
    return;
  }

  throw new ForbiddenException(
    'Chamado fora das empresas e mesas que você atende.',
  );
}
