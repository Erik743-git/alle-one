import { apiRequest } from "@/lib/api";
import type { ModulePermission, PermissionModuleKey } from "@/lib/permission-modules";

export type UserPermissionsPayload = {
  module: PermissionModuleKey;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
};

export type GetUserPermissionsResponse = {
  userId: string;
  role: string;
  permissions: Array<{
    id: string;
    userId: string;
    module: PermissionModuleKey;
    canView: boolean;
    canCreate: boolean;
    canEdit: boolean;
    canDelete: boolean;
    canApprove: boolean;
  }>;
  effective: ModulePermission[];
};

export const permissionsService = {
  async getForUser(userId: string) {
    return apiRequest<GetUserPermissionsResponse>(
      `/permissions/users/${userId}`,
    );
  },

  async replaceForUser(userId: string, permissions: UserPermissionsPayload[]) {
    return apiRequest<{ message: string; effective: ModulePermission[] }>(
      `/permissions/users/${userId}`,
      {
        method: "PUT",
        body: { permissions },
      },
    );
  },
};
