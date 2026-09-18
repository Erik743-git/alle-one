import dynamic from "next/dynamic";
import type { ComponentType } from "react";

import type { PortalTabRoute } from "./route-table";

/**
 * Carrega sob demanda o componente de cada rota mantida viva. Importa o
 * export nomeado `PortalPageComponent` (a implementação real), não o
 * `default` do módulo — esse virou o delegador fino que registra a guia.
 * `ssr: false` porque essas instâncias só existem no host (cliente); o
 * `page.tsx` real continua respondendo no servidor normalmente.
 */
function lazy(
  loader: () => Promise<{ PortalPageComponent: ComponentType }>,
) {
  return dynamic(
    () => loader().then((m) => ({ default: m.PortalPageComponent })),
    { ssr: false },
  );
}

export const PORTAL_ROUTE_COMPONENTS: Record<PortalTabRoute, ComponentType> =
  {
    "/dashboard": lazy(() => import("@/app/dashboard/page")),
    "/console": lazy(() => import("@/app/console/page")),
    "/correio": lazy(() => import("@/app/correio/page")),
    "/financeiro": lazy(() => import("@/app/financeiro/page")),
    "/gerador-relatorios": lazy(() => import("@/app/gerador-relatorios/page")),
    "/tickets": lazy(() => import("@/app/tickets/page")),
    "/tickets/new": lazy(() => import("@/app/tickets/new/page")),
    "/tickets/pre-tickets": lazy(
      () => import("@/app/tickets/pre-tickets/page"),
    ),
    "/tickets/pre-tickets/[id]": lazy(
      () => import("@/app/tickets/pre-tickets/[id]/page"),
    ),
    "/tickets/[ticketNumber]": lazy(
      () => import("@/app/tickets/[ticketNumber]/page"),
    ),
    "/tickets/[ticketNumber]/edit": lazy(
      () => import("@/app/tickets/[ticketNumber]/edit/page"),
    ),
    "/gmud": lazy(() => import("@/app/gmud/page")),
    "/gmud/new": lazy(() => import("@/app/gmud/new/page")),
    "/gmud/[id]": lazy(() => import("@/app/gmud/[id]/page")),
    "/apontamentos": lazy(() => import("@/app/apontamentos/page")),
    "/apontamentos/aprovar-horas-extras": lazy(
      () => import("@/app/apontamentos/aprovar-horas-extras/page"),
    ),
    "/apontamentos/aprovar-justificativas": lazy(
      () => import("@/app/apontamentos/aprovar-justificativas/page"),
    ),
    "/apontamentos/empresa/[companyId]": lazy(
      () => import("@/app/apontamentos/empresa/[companyId]/page"),
    ),
    "/apontamentos/[userId]": lazy(
      () => import("@/app/apontamentos/[userId]/page"),
    ),
    "/inventario": lazy(() => import("@/app/inventario/page")),
    "/inventario/tipo/[assetTypeId]": lazy(
      () => import("@/app/inventario/tipo/[assetTypeId]/page"),
    ),
    "/inventario/[companyId]": lazy(
      () => import("@/app/inventario/[companyId]/page"),
    ),
    "/projetos": lazy(() => import("@/app/projetos/page")),
    "/projetos/[companyId]": lazy(
      () => import("@/app/projetos/[companyId]/page"),
    ),
    "/projetos/[companyId]/[projectId]": lazy(
      () => import("@/app/projetos/[companyId]/[projectId]/page"),
    ),
    "/admin": lazy(() => import("@/app/admin/page")),
    "/admin/auditoria": lazy(() => import("@/app/admin/auditoria/page")),
    "/admin/classificacao": lazy(
      () => import("@/app/admin/classificacao/page"),
    ),
    "/admin/email": lazy(() => import("@/app/admin/email/page")),
    "/admin/empresas": lazy(() => import("@/app/admin/empresas/page")),
    "/admin/ticket": lazy(() => import("@/app/admin/ticket/page")),
    "/admin/usuarios": lazy(() => import("@/app/admin/usuarios/page")),
  };
