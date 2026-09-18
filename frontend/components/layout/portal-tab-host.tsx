"use client";

import { createPortal } from "react-dom";
import { useCallback, useState, useSyncExternalStore } from "react";

import {
  getRenderCacheEntries,
  getRenderCacheVersion,
  subscribeRenderCache,
} from "@/lib/portal-tabs/render-cache";
import { usePortalTabs } from "./portal-tabs-provider";
import { PortalRouteContextOverride } from "./portal-route-context";
import { getDockNode, subscribeDock } from "./portal-tab-dock";
import { PortalTabHostContext } from "./portal-tab-host-context";

/**
 * Mantém viva a tela de cada guia aberta. Fica no layout raiz (nunca
 * desmonta) e portala CADA guia (ativa ou não) por `createPortal` — a
 * guia ativa vai para o encaixe que a página real (remontada a cada
 * navegação) acabou de anunciar; as demais vão para um contêiner oculto
 * mantido aqui mesmo.
 *
 * ATENÇÃO — conhecido incompleto: em teste (16-17/09), o estado interno da
 * tela (ex.: texto digitado num filtro) NÃO sobrevive de forma confiável à
 * troca de guia neste build, apesar do parent nunca desmontar e do alvo do
 * portal nunca ficar ausente. A suspeita mais forte é a combinação de
 * React Strict Mode (que reexecuta efeitos duas vezes a cada nova
 * montagem de rota) com o cache em módulo (fora do React) + reconciliação
 * de portal — não confirmada. Não usar em produção até isso ser resolvido
 * e reverificado. A barra de guias e a navegação em si (abrir, fechar,
 * duplicar, fechar todas, focar guia existente) funcionam normalmente;
 * só a preservação de estado interno da tela é que ainda falha.
 */
export function PortalTabHost() {
  const { tabs, activeId } = usePortalTabs();
  useSyncExternalStore(subscribeRenderCache, getRenderCacheVersion, () => 0);
  const entries = getRenderCacheEntries();
  const dock = useSyncExternalStore(subscribeDock, getDockNode, () => null);

  const [hiddenNode, setHiddenNode] = useState<HTMLDivElement | null>(null);
  const hiddenRef = useCallback((node: HTMLDivElement | null) => {
    setHiddenNode(node);
  }, []);

  const activeHref = tabs.find((tab) => tab.id === activeId)?.href ?? null;

  return (
    <PortalTabHostContext.Provider value={true}>
      <div ref={hiddenRef} hidden aria-hidden />
      {hiddenNode
        ? entries.map((entry) => {
            const isActive = entry.href === activeHref;
            const target = isActive && dock ? dock : hiddenNode;
            return createPortal(
              <PortalRouteContextOverride href={entry.href} params={entry.params}>
                {entry.node}
              </PortalRouteContextOverride>,
              target,
              entry.href,
            );
          })
        : null}
    </PortalTabHostContext.Provider>
  );
}
