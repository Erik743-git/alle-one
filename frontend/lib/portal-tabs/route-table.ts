/**
 * Rotas que abrem dentro das guias do portal. A ordem importa: rotas fixas
 * ("/tickets/new") vêm antes das dinâmicas ("/tickets/[ticketNumber]").
 * Precisa acompanhar as pastas de `app/` — rota que não estiver aqui continua
 * funcionando, só sem manter a tela viva ao trocar de guia.
 */
export const PORTAL_TAB_ROUTES = [
  "/dashboard",
  "/console",
  "/correio",
  "/mural",
  "/financeiro",
  "/gerador-relatorios",
  "/tickets",
  "/tickets/new",
  "/tickets/pre-tickets",
  "/tickets/pre-tickets/[id]",
  "/tickets/[ticketNumber]",
  "/tickets/[ticketNumber]/edit",
  "/gmud",
  "/gmud/new",
  "/gmud/[id]",
  "/apontamentos",
  "/apontamentos/aprovar-horas-extras",
  "/apontamentos/aprovar-justificativas",
  "/apontamentos/empresa/[companyId]",
  "/apontamentos/[userId]",
  "/inventario",
  "/inventario/tipo/[assetTypeId]",
  "/inventario/[companyId]",
  "/projetos",
  "/projetos/[companyId]",
  "/projetos/[companyId]/[projectId]",
  "/admin",
  "/admin/auditoria",
  "/admin/classificacao",
  "/admin/email",
  "/admin/empresas",
  "/admin/ticket",
  "/admin/usuarios",
] as const;

export type PortalTabRoute = (typeof PORTAL_TAB_ROUTES)[number];

export type PortalRouteMatch = {
  route: PortalTabRoute;
  params: Record<string, string>;
};

const COMPILED = PORTAL_TAB_ROUTES.map((route) => ({
  route,
  segments: route.split("/").filter(Boolean),
}));

export function matchPortalRoute(pathname: string): PortalRouteMatch | null {
  const parts = pathname.split("?")[0].split("/").filter(Boolean);
  for (const { route, segments } of COMPILED) {
    if (segments.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (seg.startsWith("[") && seg.endsWith("]")) {
        let value: string;
        try {
          value = decodeURIComponent(parts[i]);
        } catch {
          value = parts[i];
        }
        params[seg.slice(1, -1)] = value;
      } else if (seg !== parts[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { route, params };
  }
  return null;
}
