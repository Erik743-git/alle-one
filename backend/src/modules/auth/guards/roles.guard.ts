import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isClientPortalRole } from '../../../common/security/client-portal-role';
import type { AuthenticatedRequestUser } from '../auth-request-user';
import { ROLES_KEY, type AppRole } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<AppRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!roles?.length) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedRequestUser }>();
    const user = request.user;

    if (!user) {
      return false;
    }

    if (roles.includes(user.role)) {
      return true;
    }
    // Decorators que listam CLIENT cobrem CLIENT_GESTOR / CLIENT_MEMBER.
    if (roles.includes('CLIENT') && isClientPortalRole(user.role)) {
      return true;
    }
    throw new ForbiddenException('Sem permissão para este recurso.');
  }
}
