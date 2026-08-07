import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import type { AuthenticatedRequestUser } from '../auth-request-user';

export const INTERNAL_HEALTH_TOKEN_HEADER = 'x-internal-health-token';

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

/**
 * Acesso a GET /health/integrations:
 * - header X-Internal-Health-Token == HEALTH_INTEGRATIONS_TOKEN, ou
 * - JWT válido com role ADMIN.
 */
@Injectable()
export class HealthIntegrationsAccessGuard
  extends AuthGuard('jwt')
  implements CanActivate
{
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    if (this.hasValidInternalToken(req)) {
      return true;
    }

    try {
      const ok = await (super.canActivate(context) as Promise<boolean>);
      if (!ok) {
        throw new UnauthorizedException(
          'Informe X-Internal-Health-Token ou autentique-se como ADMIN.',
        );
      }
    } catch (err) {
      if (
        err instanceof UnauthorizedException ||
        err instanceof ForbiddenException
      ) {
        throw err;
      }
      throw new UnauthorizedException(
        'Informe X-Internal-Health-Token ou autentique-se como ADMIN.',
      );
    }

    const user = (req as Request & { user?: AuthenticatedRequestUser }).user;
    if (user?.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Apenas ADMIN ou token interno podem consultar integrações.',
      );
    }
    return true;
  }

  override handleRequest<TUser = AuthenticatedRequestUser>(
    err: Error | null,
    user: TUser | false,
  ): TUser {
    if (err || !user) {
      throw (
        err ||
        new UnauthorizedException(
          'Informe X-Internal-Health-Token ou autentique-se como ADMIN.',
        )
      );
    }
    return user;
  }

  private hasValidInternalToken(req: Request): boolean {
    const expected = process.env.HEALTH_INTEGRATIONS_TOKEN?.trim();
    if (!expected) {
      return false;
    }
    const provided = String(
      req.headers[INTERNAL_HEALTH_TOKEN_HEADER] ?? '',
    ).trim();
    if (!provided) {
      return false;
    }
    return safeEqual(expected, provided);
  }
}
