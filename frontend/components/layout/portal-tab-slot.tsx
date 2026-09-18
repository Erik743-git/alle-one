"use client";

import { useEffect, type ComponentType } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { ensureRenderCacheEntry } from "@/lib/portal-tabs/render-cache";
import type { PortalTabRoute } from "@/lib/portal-tabs/route-table";
import { matchPortalRoute } from "@/lib/portal-tabs/route-table";
import ProtectedPage from "@/components/auth/protected-page";
import AppShell from "./app-shell";

type Props = {
  route: PortalTabRoute;
  Component: ComponentType;
};

/**
 * Fica no lugar do conteúdo real dentro de cada `page.tsx` (que o Next
 * continua montando/desmontando a cada navegação, normalmente). Não
 * renderiza nada visível: só garante que exista uma instância viva desta
 * tela no cache — quem mostra o conteúdo de verdade é `PortalTabHost`.
 */
export function PortalTabSlot({ route, Component }: Props) {
  const pathname = usePathname();
  const search = useSearchParams();
  const query = search.toString();
  const href = query ? `${pathname}?${query}` : pathname;

  useEffect(() => {
    const match = matchPortalRoute(href);
    if (!match || match.route !== route) return;
    ensureRenderCacheEntry(href, route, match.params, Component);
  }, [href, route, Component]);

  // Moldura (menu, barra de guias, encaixe) desenhada uma vez, aqui.
  return (
    <ProtectedPage>
      <AppShell>{null}</AppShell>
    </ProtectedPage>
  );
}
