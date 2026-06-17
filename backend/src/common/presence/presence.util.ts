/** Usuário considerado online se teve atividade nos últimos N minutos. */
export const PRESENCE_ONLINE_THRESHOLD_MS = 10 * 60 * 1000;

export function isUserOnline(
  lastSeenAt: Date | string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!lastSeenAt) {
    return false;
  }

  const ts =
    lastSeenAt instanceof Date
      ? lastSeenAt.getTime()
      : new Date(lastSeenAt).getTime();

  if (Number.isNaN(ts)) {
    return false;
  }

  return nowMs - ts < PRESENCE_ONLINE_THRESHOLD_MS;
}

export function onlineSinceDate(now: Date = new Date()): Date {
  return new Date(now.getTime() - PRESENCE_ONLINE_THRESHOLD_MS);
}
