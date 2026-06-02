import type { AuthenticatedRequestUser } from '../auth/auth-request-user';

export type AuditActor = Pick<
  AuthenticatedRequestUser,
  'userId' | 'email' | 'role' | 'companyId'
>;

export type AuditRequestMeta = {
  method: string;
  path: string;
  ip: string | null;
  userAgent: string | null;
  params?: unknown;
  query?: unknown;
};

export type AuditLogInput = {
  actor: AuditActor | null;
  action: string;
  entity: string;
  entityId?: string | null;
  payload?: Record<string, unknown> | null;
};

