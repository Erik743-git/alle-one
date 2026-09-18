"use client";

import { useMemo } from "react";
import type { ReactNode } from "react";
// Import de caminho interno do Next: os mesmos contextos que usePathname(),
// useSearchParams() e useParams() leem. É o único jeito de fazer uma tela
// "adormecida" (fora da URL atual) continuar respondendo com o endereço que
// ela tinha quando foi aberta, em vez do endereço real do navegador.
// Se uma versão futura do Next mudar esse caminho, o efeito é a tela
// mantida ler o endereço errado — vale conferir depois de atualizar o Next.
import {
  PathnameContext,
  PathParamsContext,
  SearchParamsContext,
} from "next/dist/shared/lib/hooks-client-context.shared-runtime";

import { pathOf } from "@/lib/portal-tabs/tab-model";

type Props = {
  href: string;
  params: Record<string, string>;
  children: ReactNode;
};

/**
 * Faz `usePathname`/`useSearchParams`/`useParams`, dentro de `children`,
 * responderem com o endereço desta guia — mesmo que o navegador esteja em
 * outra URL porque a guia está adormecida em segundo plano.
 */
export function PortalRouteContextOverride({ href, params, children }: Props) {
  const pathname = useMemo(() => pathOf(href), [href]);
  const searchParams = useMemo(() => {
    const query = href.includes("?") ? href.split("?")[1] : "";
    return new URLSearchParams(query);
  }, [href]);

  return (
    <PathnameContext.Provider value={pathname}>
      <SearchParamsContext.Provider value={searchParams}>
        <PathParamsContext.Provider value={params}>
          {children}
        </PathParamsContext.Provider>
      </SearchParamsContext.Provider>
    </PathnameContext.Provider>
  );
}
