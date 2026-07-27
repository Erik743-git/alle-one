import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { tap } from 'rxjs/operators';
import { AuditService } from './audit.service';
import { AUDIT_META_KEY, type AuditMetaOptions } from './audit.decorator';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';

type AuthedRequest = Request & { user?: AuthenticatedRequestUser };

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function getClientIp(req: Request): string | null {
  const xff = (req.headers['x-forwarded-for'] as string | undefined)?.trim();
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return (req.socket?.remoteAddress ?? null) as string | null;
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly audit: AuditService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const http = context.switchToHttp();
    const req = http.getRequest<AuthedRequest>();

    const method = String(req.method || '').toUpperCase();
    if (!MUTATING_METHODS.has(method)) {
      return next.handle();
    }

    const actor = req.user ?? null;
    if (!actor) {
      return next.handle();
    }

    const meta =
      this.reflector.getAllAndOverride<AuditMetaOptions>(AUDIT_META_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? null;

    // Com @AuditMeta: audita qualquer role autenticada (GMUD approve, ack, import…).
    // Sem meta: mantém o comportamento amplo só para ADMIN.
    if (!meta && actor.role !== 'ADMIN') {
      return next.handle();
    }

    const controllerPath =
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      (Reflect.getMetadata('path', context.getClass()) as string | undefined) ??
      context.getClass().name;

    const entity = meta?.entity ?? String(controllerPath || 'unknown');

    const entityId =
      meta?.entityIdParam && req.params
        ? String((req.params as any)[meta.entityIdParam] ?? '')
        : null;
    const normalizedEntityId = entityId && entityId !== 'undefined' ? entityId : null;

    const action = meta?.action
      ? `${meta.action}`
      : `${method} ${req.baseUrl || ''}${req.path || ''}`.trim();

    const requestMeta = {
      method,
      path: `${req.baseUrl || ''}${req.path || ''}` || req.originalUrl || '',
      ip: getClientIp(req),
      userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
      params: req.params ?? undefined,
      query: req.query ?? undefined,
    };

    return next.handle().pipe(
      tap({
        next: () => {
          void this.audit.log({
            actor: {
              userId: actor.userId,
              email: actor.email,
              role: actor.role,
              companyId: actor.companyId,
            },
            action,
            entity,
            entityId: normalizedEntityId,
            payload: {
              request: requestMeta,
              body: req.body ?? null,
            },
          });
        },
        error: (err) => {
          const message =
            err instanceof Error ? err.message : err ? String(err) : 'unknown_error';
          void this.audit.log({
            actor: {
              userId: actor.userId,
              email: actor.email,
              role: actor.role,
              companyId: actor.companyId,
            },
            action: `${action} [ERROR]`,
            entity,
            entityId: normalizedEntityId,
            payload: {
              request: requestMeta,
              body: req.body ?? null,
              error: { message },
            },
          });
        },
      }),
    );
  }
}

