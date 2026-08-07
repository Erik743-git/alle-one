import {
  parseCacheMaxEntries,
  parseCacheTtlMs,
  TtlLruCache,
} from './ttl-lru-cache';

describe('TtlLruCache', () => {
  it('retorna null para chave ausente ou expirada', () => {
    jest.useFakeTimers();
    const cache = new TtlLruCache<string>(10, 1_000);
    expect(cache.get('a')).toBeNull();
    cache.set('a', 'ok');
    expect(cache.get('a')).toBe('ok');
    jest.advanceTimersByTime(1_001);
    expect(cache.get('a')).toBeNull();
    jest.useRealTimers();
  });

  it('evicta a entrada menos usada quando atinge o limite', () => {
    const cache = new TtlLruCache<number>(2, 60_000);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.get('a')).toBe(1); // a vira MRU
    cache.set('c', 3); // deve sair b
    expect(cache.get('b')).toBeNull();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
    expect(cache.size()).toBe(2);
  });

  it('delete e clear removem entradas', () => {
    const cache = new TtlLruCache<string>(5, 60_000);
    cache.set('x', '1');
    cache.set('y', '2');
    cache.delete('x');
    expect(cache.get('x')).toBeNull();
    cache.clear();
    expect(cache.size()).toBe(0);
  });
});

describe('parseCacheTtlMs / parseCacheMaxEntries', () => {
  it('aplica fallback e teto', () => {
    expect(parseCacheTtlMs(undefined, 60_000)).toBe(60_000);
    expect(parseCacheTtlMs('1000', 60_000)).toBe(60_000);
    expect(parseCacheTtlMs('120000', 60_000)).toBe(120_000);
    expect(parseCacheTtlMs('9999999', 60_000)).toBe(30 * 60_000);

    expect(parseCacheMaxEntries(undefined, 50)).toBe(50);
    expect(parseCacheMaxEntries('0', 50)).toBe(50);
    expect(parseCacheMaxEntries('80', 50)).toBe(80);
    expect(parseCacheMaxEntries('9999', 50)).toBe(500);
  });
});
