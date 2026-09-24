"use client";

import { createPortal } from "react-dom";
import {
  useCallback,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from "react";

import { useAuth } from "@/lib/auth-context";
import { moduloDesabilitado } from "@/lib/modulos-desabilitados";
import { moduloDaRota } from "@/lib/portal-tabs/route-table";
import {
  getRenderCacheEntries,
  getRenderCacheVersion,
  subscribeRenderCache,
} from "@/lib/portal-tabs/render-cache";
import { usePortalTabs } from "./portal-tabs-provider";
import { PortalRouteContextOverride } from "./portal-route-context";
import { getDockNode, subscribeDock } from "./portal-tab-dock";
import { PortalTabHostContext } from "./portal-tab-host-context";

/** Tela de módulo desligado em Administração → Acesso por perfil. */
function ModuloIndisponivel() {
  return (
    <div
      role="status"
      className="mx-auto mt-16 max-w-md rounded-xl border border-border bg-card p-8 text-center"
    >
      <p className="text-lg font-semibold text-foreground">
        Este módulo não está disponível.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Ele foi desligado para o seu perfil. Se precisar dele, fale com um
        administrador.
      </p>
    </div>
  );
}

/**
 * Mantém viva a tela de cada guia aberta. Fica no layout raiz (nunca
 * desmonta).
 *
 * Cada guia tem um contêiner próprio que NUNCA muda: o React sempre desenha
 * a tela ali. Trocar de guia só move esse contêiner no DOM — para o encaixe
 * da página ativa ou para um depósito oculto. Se o alvo do `createPortal`
 * mudasse, o React desmontaria e montaria a tela de novo (é assim que ele
 * trata portal com contêiner diferente) e o estado se perderia.
 */
export function PortalTabHost() {
  const { tabs, activeId } = usePortalTabs();
  // Relê a lista de módulos desligados quando a sessão muda (login, /auth/me).
  useAuth();
  useSyncExternalStore(subscribeRenderCache, getRenderCacheVersion, () => 0);
  const entries = getRenderCacheEntries();
  const dock = useSyncExternalStore(subscribeDock, getDockNode, () => null);

  const [hiddenNode, setHiddenNode] = useState<HTMLDivElement | null>(null);
  const hiddenRef = useCallback((node: HTMLDivElement | null) => {
    setHiddenNode(node);
  }, []);

  // Um contêiner por guia, criado uma vez e reaproveitado entre renders.
  const [containers] = useState(() => new Map<string, HTMLDivElement>());
  const containerFor = (href: string) => {
    let node = containers.get(href);
    if (!node) {
      node = document.createElement("div");
      node.className = "min-w-0";
      containers.set(href, node);
    }
    return node;
  };

  const activeHref = tabs.find((tab) => tab.id === activeId)?.href ?? null;

  // Coloca cada contêiner no lugar certo depois de cada render.
  useLayoutEffect(() => {
    if (!hiddenNode) return;
    const alive = new Set(entries.map((entry) => entry.href));
    for (const [href, node] of containers) {
      if (!alive.has(href)) {
        node.remove();
        containers.delete(href);
        continue;
      }
      const parent = href === activeHref && dock ? dock : hiddenNode;
      if (node.parentNode !== parent) parent.appendChild(node);
    }
  });

  return (
    <PortalTabHostContext.Provider value={true}>
      <div ref={hiddenRef} hidden aria-hidden />
      {hiddenNode
        ? entries.map((entry) =>
            createPortal(
              <PortalRouteContextOverride
                href={entry.href}
                params={entry.params}
              >
                {(() => {
                  const modulo = moduloDaRota(entry.href);
                  return modulo && moduloDesabilitado(modulo) ? (
                    <ModuloIndisponivel />
                  ) : (
                    entry.node
                  );
                })()}
              </PortalRouteContextOverride>,
              containerFor(entry.href),
              entry.href,
            ),
          )
        : null}
    </PortalTabHostContext.Provider>
  );
}
