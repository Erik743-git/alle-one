import type { PermissionModule } from '@prisma/client';

export type EffectiveModulePermission = {
  module: PermissionModule;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
};

export type AuthenticatedRequestUser = {
  userId: string;
  email: string;
  role:
    | 'ADMIN'
    | 'COLLABORATOR'
    | 'PJ'
    | 'CLIENT'
    | 'CLIENT_GESTOR'
    | 'CLIENT_MEMBER';
  companyId: string | null;
  permissions: EffectiveModulePermission[];
  /** Memberships do portal cliente (multi-empresa). */
  companies?: Array<{
    id: string;
    name: string;
    clientRole: 'CLIENT_GESTOR' | 'CLIENT_MEMBER';
  }>;
};
