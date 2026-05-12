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
  role: 'ADMIN' | 'COLLABORATOR' | 'CLIENT';
  companyId: string | null;
  permissions: EffectiveModulePermission[];
};
