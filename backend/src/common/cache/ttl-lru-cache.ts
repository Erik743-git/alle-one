/**
 * Cache em memória com TTL e limite de entradas (evicção LRU).
 * Útil para dashboard/horas sem depender de Redis.
 */
export class TtlLruCache<T> {
  private readonly store = new Map<string, { expiresAt: number; value: T }>();

  constructor(
    private readonly maxEntries: number,
    private readonly defaultTtlMs: number,
  ) {
    if (!Number.isFinite(maxEntries) || maxEntries < 1) {
      throw new Error('TtlLruCache: maxEntries deve ser >= 1');
    }
    if (!Number.isFinite(defaultTtlMs) || defaultTtlMs < 1) {
      throw new Error('TtlLruCache: defaultTtlMs deve ser >= 1');
    }
  }

  get(key: string): T | null {
    const hit = this.store.get(key);
    if (!hit) return null;
    if (hit.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    // Move para o fim = mais recentemente usado.
    this.store.delete(key);
    this.store.set(key, hit);
    return hit.value;
  }

  set(key: string, value: T, ttlMs = this.defaultTtlMs): void {
    if (this.store.has(key)) {
      this.store.delete(key);
    }
    while (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value as string | undefined;
      if (oldest == null) break;
      this.store.delete(oldest);
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + Math.max(1, ttlMs),
    });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}

export function parseCacheTtlMs(
  envValue: string | undefined,
  fallbackMs: number,
  minMs = 5_000,
  maxMs = 30 * 60_000,
): number {
  const n = Number(envValue);
  if (!Number.isFinite(n) || n < minMs) return fallbackMs;
  return Math.min(Math.trunc(n), maxMs);
}

export function parseCacheMaxEntries(
  envValue: string | undefined,
  fallback: number,
  min = 1,
  max = 500,
): number {
  const n = Number(envValue);
  if (!Number.isFinite(n) || n < min) return fallback;
  return Math.min(Math.trunc(n), max);
}
