import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { tap } from 'rxjs/operators';
import { AuditService } from './audit.service';
import { AUDIT_META_KEY, type AuditMetaOptions } from './audit.decorator';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { resolveAuditClientIp } from './audit-client-ip';

type AuthedRequest = Request & { user?: AuthenticatedRequestUser };

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly audit: AuditService,
    private readonly reflector: Reflector,
  ) {}

  private logAuditSafely(input: Parameters<AuditService['log']>[0]) {
    void this.audit.log(input).catch((err) => {
      this.logger.warn(
        `Falha ao gravar auditoria (${input.action}): ${
          err instanceof Error ? err.message : err
        }`,
      );
    });
  }

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
      (Reflect.getMetadata('path', context.getClass()) as string | undefined) ??
      context.getClass().name;

    const entity = meta?.entity ?? String(controllerPath || 'unknown');

    const entityId =
      meta?.entityIdParam && req.params
        ? String((req.params as any)[meta.entityIdParam] ?? '')
        : null;
    const normalizedEntityId =
      entityId && entityId !== 'undefined' ? entityId : null;

    const action = meta?.action
      ? `${meta.action}`
      : `${method} ${req.baseUrl || ''}${req.path || ''}`.trim();

    const requestMeta = {
      method,
      path: `${req.baseUrl || ''}${req.path || ''}` || req.originalUrl || '',
      ip: resolveAuditClientIp(req),
      userAgent: req.headers['user-agent'] ?? null,
      params: req.params ?? undefined,
      query: req.query ?? undefined,
    };

    return next.handle().pipe(
      tap({
        next: () => {
          this.logAuditSafely({
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
            err instanceof Error
              ? err.message
              : err
                ? String(err)
                : 'unknown_error';
          this.logAuditSafely({
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
