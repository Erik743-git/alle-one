import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { AcessoService } from './acesso.service';
import { MODULO_PORTAL_KEY } from './modulo-portal.decorator';

/**
 * Guard global (depois do JWT): rota marcada com @ModuloPortal de um módulo
 * desligado para o perfil responde 403. Rota pública ou sem marca passa; a
 * permissão fina de cada rota continua nos guards do controller.
 */
@Injectable()
export class AcessoModuloGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly acesso: AcessoService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const chave = this.reflector.getAllAndOverride<string | undefined>(
      MODULO_PORTAL_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!chave) return true;
    const user = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedRequestUser }>().user;
    // Sem usuário a rota é pública: quem decide é a própria rota.
    if (!user) return true;
    if (await this.acesso.liberado(user.role, chave)) return true;
    throw new ForbiddenException('Este módulo não está disponível.');
  }
}
