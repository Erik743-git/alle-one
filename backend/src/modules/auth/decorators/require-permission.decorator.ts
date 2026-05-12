import { SetMetadata } from '@nestjs/common';
import type { PermissionModule } from '@prisma/client';
import type { PermissionFlagKey } from '../../permissions/permissions.types';

export const REQUIRE_PERMISSION_KEY = 'require_permission';

export type RequirePermissionMeta = {
  module: PermissionModule;
  flag: PermissionFlagKey;
};

export const RequirePermission = (
  module: PermissionModule,
  flag: PermissionFlagKey,
) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, {
    module,
    flag,
  } satisfies RequirePermissionMeta);
