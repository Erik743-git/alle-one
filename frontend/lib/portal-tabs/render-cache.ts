import type { ComponentType, ReactElement } from "react";
import { createElement } from "react";

/**
 * Guarda uma instância React viva por endereço (href) — é o que faz a tela
 * continuar carregada ao trocar de guia. `PortalTabHost` é quem lê este
 * cache e decide o que mostrar; `PortalTabSlot` (dentro de cada page.tsx)
 * é quem registra a entrada na primeira visita.
 *
 * Fica fora do React de propósito: cada page.tsx real do Next monta e
 * desmonta a cada navegação, então o cache não pode viver dentro dele.
 */
export type RenderCacheEntry = {
  href: string;
  route: string;
  params: Record<string, string>;
  node: ReactElement;
};

const cache = new Map<string, RenderCacheEntry>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version += 1;
  listeners.forEach((listener) => listener());
}

export function subscribeRenderCache(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getRenderCacheVersion() {
  return version;
}

export function getRenderCacheEntries(): RenderCacheEntry[] {
  return [...cache.values()];
}

export function hasRenderCacheEntry(href: string): boolean {
  return cache.has(href);
}

/** Cria a instância se ainda não existir; visitas seguintes reaproveitam. */
export function ensureRenderCacheEntry(
  href: string,
  route: string,
  params: Record<string, string>,
  Component: ComponentType,
): void {
  if (cache.has(href)) return;
  cache.set(href, {
    href,
    route,
    params,
    node: createElement(Component, { key: href }),
  });
  emit();
}

/** Fecha a guia de verdade: a instância React some e limpa seus efeitos. */
export function evictRenderCacheEntry(href: string): void {
  if (!cache.delete(href)) return;
  emit();
}

/** Mantém só os hrefs informados — chamado sempre que a lista de guias muda. */
export function pruneRenderCacheTo(hrefs: ReadonlySet<string>): void {
  let changed = false;
  for (const key of cache.keys()) {
    if (!hrefs.has(key)) {
      cache.delete(key);
      changed = true;
    }
  }
  if (changed) emit();
}
