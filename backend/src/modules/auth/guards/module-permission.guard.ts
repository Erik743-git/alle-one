import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PermissionModule } from '@prisma/client';
import type { AuthenticatedRequestUser } from '../auth-request-user';
import {
  REQUIRE_PERMISSION_KEY,
  type RequirePermissionMeta,
} from '../decorators/require-permission.decorator';

@Injectable()
export class ModulePermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const meta = this.reflector.getAllAndOverride<
      RequirePermissionMeta | undefined
    >(REQUIRE_PERMISSION_KEY, [context.getHandler(), context.getClass()]);

    if (!meta) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedRequestUser }>();
    const user = request.user;

    if (!user) {
      return false;
    }

    if (user.role === 'ADMIN') {
      return true;
    }

    // Regra de produto: Dashboard é sempre visível para usuários não-admin autenticados.
    // (O backend ainda aplica o escopo por empresa para CLIENT via DashboardService.)
    if (
      meta.module === ('DASHBOARD' as PermissionModule) &&
      meta.flag === 'canView'
    ) {
      return true;
    }

    const entry = user.permissions.find(
      (p) => p.module === (meta.module as PermissionModule),
    );

    if (!entry || !entry[meta.flag]) {
      throw new ForbiddenException('Sem permissão para este recurso');
    }

    return true;
  }
}
