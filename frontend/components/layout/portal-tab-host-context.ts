"use client";

import { createContext, useContext } from "react";

/**
 * Verdadeiro dentro de uma tela mantida viva pelo `PortalTabHost`. Serve
 * para o `AppShell` da própria tela não redesenhar menu, barra de guias e
 * encaixe — isso já foi desenhado uma vez pela página real (a que o Next
 * montou para a URL atual).
 */
export const PortalTabHostContext = createContext(false);

export function useInsidePortalTabHost(): boolean {
  return useContext(PortalTabHostContext);
}
