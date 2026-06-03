import { BadRequestException } from '@nestjs/common';

export type AdminAuditLogsQuery = {
  offset: number;
  limit: number;
  from?: string;
  to?: string;
  actorId?: string;
  entity?: string;
  action?: string;
  order: 'asc' | 'desc';
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function pickQueryValue(raw: Record<string, unknown>, key: string): unknown {
  const value = raw[key];
  if (Array.isArray(value)) return value[0];
  return value;
}

function pickOptionalString(raw: Record<string, unknown>, key: string): string | undefined {
  const value = pickQueryValue(raw, key);
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function parseQueryInt(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
}

/** Converte query string do Express em parâmetros tipados (evita falha do class-validator em offset/limit). */
export function parseAdminAuditLogsQuery(
  raw: Record<string, unknown>,
): AdminAuditLogsQuery {
  const offset = Math.max(0, parseQueryInt(pickQueryValue(raw, 'offset'), 0));
  const limit = Math.min(
    200,
    Math.max(1, parseQueryInt(pickQueryValue(raw, 'limit'), 50)),
  );

  const orderRaw = pickOptionalString(raw, 'order');
  const order = orderRaw === 'asc' ? 'asc' : 'desc';

  const actorId = pickOptionalString(raw, 'actorId');
  if (actorId && !UUID_RE.test(actorId)) {
    throw new BadRequestException('actorId inválido (UUID esperado).');
  }

  const from = pickOptionalString(raw, 'from');
  const to = pickOptionalString(raw, 'to');
  if (from && Number.isNaN(Date.parse(from))) {
    throw new BadRequestException('Parâmetro from inválido (ISO 8601).');
  }
  if (to && Number.isNaN(Date.parse(to))) {
    throw new BadRequestException('Parâmetro to inválido (ISO 8601).');
  }

  return {
    offset,
    limit,
    from,
    to,
    actorId,
    entity: pickOptionalString(raw, 'entity'),
    action: pickOptionalString(raw, 'action'),
    order,
  };
}
