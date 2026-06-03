import type { AuthenticatedRequestUser } from '../auth/auth-request-user';

export function seesGmudsByParticipationOnly(
  role: AuthenticatedRequestUser['role'],
): boolean {
  return role === 'COLLABORATOR' || role === 'PJ';
}

export function gmudParticipationWhere(userId: string) {
  return {
    OR: [
      { responsibleId: userId },
      { createdBy: userId },
      { executors: { some: { userId } } },
      { approvers: { some: { userId } } },
    ],
  };
}

export function userParticipatesInGmud(
  userId: string,
  gmud: {
    createdBy: string;
    responsibleId: string | null;
    executors: Array<{ user: { id: string } }>;
    approvers: Array<{ user: { id: string } }>;
  },
): boolean {
  if (gmud.createdBy === userId) return true;
  if (gmud.responsibleId === userId) return true;
  if (gmud.executors.some((e) => e.user.id === userId)) return true;
  if (gmud.approvers.some((a) => a.user.id === userId)) return true;
  return false;
}
