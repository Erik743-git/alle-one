import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuditLogInput } from './audit.types';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'token',
  'refreshToken',
  'authorization',
  'cookie',
  'cookies',
  'set-cookie',
  'file',
  'files',
  'buffer',
]);

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[max_depth]';

  if (value == null) return value;
  if (typeof value === 'string') {
    if (value.length > 4000) return `${value.slice(0, 4000)}…`;
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    return value.slice(0, 200).map((v) => sanitizeValue(v, depth + 1));
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (SENSITIVE_KEYS.has(k)) {
        out[k] = '[redacted]';
        continue;
      }
      out[k] = sanitizeValue(v, depth + 1);
    }
    return out;
  }

  return String(value);
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: AuditLogInput) {
    const actor = input.actor;
    const payload = input.payload ? (sanitizeValue(input.payload) as any) : null;

    return this.prisma.auditLog.create({
      data: {
        userId: actor?.userId ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        payload,
      },
    });
  }
}

