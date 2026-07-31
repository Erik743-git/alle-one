import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PermissionModule } from '@prisma/client';
import type { AuthenticatedRequestUser } from '../auth-request-user';
import {
  REQUIRE_PERMISSION_KEY,
  type RequirePermissionMeta,
} from '../decorators/require-permission.decorator';

/**
 * Regras de produto (sobrescrevem a matriz `permissions` do banco):
 * - REPORTS: somente ADMIN
 * - TICKETS: criar ticket e apontar — ADMIN/COLLABORATOR/PJ com `canCreate`;
 *   CLIENT só visualiza (escopo empresa)
 * - DASHBOARD canView: liberado para autenticados (escopo por empresa no service)
 * - CORREIO canView: não-CLIENT
 * - INVENTARIO/FINANCIAL/RENDIMENTO: defaults por role documentados abaixo
 *
 * Ver também: docs/PERMISSIONS_MATRIX.md
 */
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
      throw new UnauthorizedException('Não autenticado');
    }

    if (user.role === 'ADMIN') {
      return true;
    }

    if (meta.module === ('REPORTS' as PermissionModule)) {
      throw new ForbiddenException(
        'Relatórios disponíveis apenas para administradores.',
      );
    }

    // Regra de produto: Dashboard é sempre visível para usuários não-admin autenticados.
    // (O backend ainda aplica o escopo por empresa para CLIENT via DashboardService.)
    if (
      meta.module === ('DASHBOARD' as PermissionModule) &&
      meta.flag === 'canView'
    ) {
      return true;
    }

    // Correio: caixa de pendências para colaboradores, PJ e admins.
    if (
      meta.module === ('CORREIO' as PermissionModule) &&
      meta.flag === 'canView' &&
      user.role !== 'CLIENT'
    ) {
      return true;
    }

    if (
      meta.module === ('INVENTARIO' as PermissionModule) &&
      meta.flag === 'canView' &&
      user.role === 'CLIENT'
    ) {
      const entry = user.permissions.find(
        (p) => p.module === ('INVENTARIO' as PermissionModule),
      );
      if (!entry || entry.canView) return true;
    }

    if (
      meta.module === ('RENDIMENTO' as PermissionModule) &&
      meta.flag === 'canView' &&
      user.role === 'PJ'
    ) {
      return true;
    }

    if (
      meta.module === ('RENDIMENTO' as PermissionModule) &&
      meta.flag === 'canView' &&
      user.role === 'CLIENT'
    ) {
      const entry = user.permissions.find(
        (p) => p.module === ('RENDIMENTO' as PermissionModule),
      );
      if (!entry || entry.canView) return true;
    }

    // Financeiro: padrão liberado para cliente; matriz explícita pode revogar.
    if (
      meta.module === ('FINANCIAL' as PermissionModule) &&
      meta.flag === 'canView' &&
      user.role === 'CLIENT'
    ) {
      const entry = user.permissions.find(
        (p) => p.module === ('FINANCIAL' as PermissionModule),
      );
      if (!entry || entry.canView) return true;
    }

    // Justificativas na própria agenda (lacuna ou voluntária): colaborador só precisa canView.
    if (
      meta.module === ('RENDIMENTO' as PermissionModule) &&
      meta.flag === 'canEdit' &&
      user.role === 'COLLABORATOR'
    ) {
      const request = context.switchToHttp().getRequest<{
        body?: { kind?: string };
      }>();
      const kind = request.body?.kind;
      if (kind === 'VOLUNTARY' || kind === 'ALERT') {
        const entry = user.permissions.find(
          (p) => p.module === ('RENDIMENTO' as PermissionModule),
        );
        if (entry?.canView) return true;
      }
    }

    const entry = user.permissions.find((p) => p.module === meta.module);

    if (!entry || !entry[meta.flag]) {
      throw new ForbiddenException('Sem permissão para este recurso');
    }

    return true;
  }
}
