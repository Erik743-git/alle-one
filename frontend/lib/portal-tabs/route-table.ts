/**
 * Rotas que abrem dentro das guias do portal. A ordem importa: rotas fixas
 * ("/tickets/new") vêm antes das dinâmicas ("/tickets/[ticketNumber]").
 * Precisa acompanhar as pastas de `app/` — rota que não estiver aqui continua
 * funcionando, só sem manter a tela viva ao trocar de guia.
 */
export const PORTAL_TAB_ROUTES = [
  "/dashboard",
  "/console",
  "/plantao",
  "/agendas",
  "/monitoramento",
  "/correio",
  "/mural",
  "/oportunidades",
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
  "/admin/satisfacao",
  "/admin/acesso",
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

/**
 * Módulo de Administração → Acesso por perfil de cada tela. Com o módulo
 * desligado a guia mostra "indisponível" em vez da tela (a API já responde
 * 403). Correio e Administração não estão na tabela: devolvem null.
 */
export function moduloDaRota(pathname: string): string | null {
  const p = pathname.split("?")[0];
  const inicio = (prefixo: string) =>
    p === prefixo || p.startsWith(`${prefixo}/`);
  if (inicio("/tickets/pre-tickets")) return "pre-tickets";
  if (inicio("/tickets")) return "tickets";
  if (inicio("/dashboard")) return "dashboard";
  if (inicio("/console") || inicio("/monitoramento")) return "monitoramento";
  if (inicio("/agendas") || inicio("/plantao")) return "agendas";
  if (inicio("/mural")) return "mural";
  if (inicio("/oportunidades")) return "oportunidades";
  if (inicio("/financeiro")) return "financeiro";
  if (inicio("/gmud")) return "gmud";
  if (inicio("/gerador-relatorios")) return "relatorios";
  if (inicio("/apontamentos")) return "apontamentos";
  if (inicio("/inventario")) return "inventario";
  if (inicio("/projetos")) return "projetos";
  return null;
}
