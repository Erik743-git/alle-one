import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionModule } from '@prisma/client';
import { ModulePermissionGuard } from './module-permission.guard';
import { REQUIRE_PERMISSION_KEY } from '../decorators/require-permission.decorator';
import type { AuthenticatedRequestUser } from '../auth-request-user';

function buildContext(
  user: AuthenticatedRequestUser | undefined,
  meta?: { module: PermissionModule; flag: keyof AuthenticatedRequestUser['permissions'][0] },
) {
  const reflector = {
    getAllAndOverride: jest.fn(() => meta),
  } as unknown as Reflector;

  const guard = new ModulePermissionGuard(reflector);

  const handler = meta
    ? {
        [REQUIRE_PERMISSION_KEY]: meta,
      }
    : {};

  return {
    guard,
    ctx: {
      getHandler: () => handler,
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user, body: {} }),
      }),
    },
  };
}

describe('ModulePermissionGuard', () => {
  it('permite ADMIN sem consultar matriz', () => {
    const user: AuthenticatedRequestUser = {
      userId: '1',
      email: 'a@b.com',
      role: 'ADMIN',
      companyId: null,
      permissions: [],
    };
    const { guard, ctx } = buildContext(user, {
      module: PermissionModule.INVENTARIO,
      flag: 'canView',
    });
    expect(guard.canActivate(ctx as never)).toBe(true);
  });

  it('bloqueia colaborador com INVENTARIO canView revogado', () => {
    const user: AuthenticatedRequestUser = {
      userId: '2',
      email: 'c@d.com',
      role: 'COLLABORATOR',
      companyId: null,
      permissions: [
        {
          module: PermissionModule.INVENTARIO,
          canView: false,
          canCreate: false,
          canEdit: false,
          canDelete: false,
          canApprove: false,
        },
      ],
    };
    const { guard, ctx } = buildContext(user, {
      module: PermissionModule.INVENTARIO,
      flag: 'canView',
    });
    expect(() => guard.canActivate(ctx as never)).toThrow(ForbiddenException);
  });

  it('permite CLIENT com FINANCIAL quando matriz não revoga', () => {
    const user: AuthenticatedRequestUser = {
      userId: '3',
      email: 'e@f.com',
      role: 'CLIENT',
      companyId: 'co1',
      permissions: [],
    };
    const { guard, ctx } = buildContext(user, {
      module: PermissionModule.FINANCIAL,
      flag: 'canView',
    });
    expect(guard.canActivate(ctx as never)).toBe(true);
  });
});
