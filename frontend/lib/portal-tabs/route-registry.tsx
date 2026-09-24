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
    "/dashboard": lazy(() => import("@/app/dashboard/page-impl")),
    "/console": lazy(() => import("@/app/console/page-impl")),
    "/plantao": lazy(() => import("@/app/plantao/page-impl")),
    "/agendas": lazy(() => import("@/app/agendas/page-impl")),
    "/monitoramento": lazy(() => import("@/app/monitoramento/page-impl")),
    "/correio": lazy(() => import("@/app/correio/page-impl")),
    "/mural": lazy(() => import("@/app/mural/page-impl")),
    "/oportunidades": lazy(() => import("@/app/oportunidades/page-impl")),
    "/financeiro": lazy(() => import("@/app/financeiro/page-impl")),
    "/gerador-relatorios": lazy(() => import("@/app/gerador-relatorios/page-impl")),
    "/tickets": lazy(() => import("@/app/tickets/page-impl")),
    "/tickets/new": lazy(() => import("@/app/tickets/new/page-impl")),
    "/tickets/pre-tickets": lazy(
      () => import("@/app/tickets/pre-tickets/page-impl"),
    ),
    "/tickets/pre-tickets/[id]": lazy(
      () => import("@/app/tickets/pre-tickets/[id]/page-impl"),
    ),
    "/tickets/[ticketNumber]": lazy(
      () => import("@/app/tickets/[ticketNumber]/page-impl"),
    ),
    "/tickets/[ticketNumber]/edit": lazy(
      () => import("@/app/tickets/[ticketNumber]/edit/page-impl"),
    ),
    "/gmud": lazy(() => import("@/app/gmud/page-impl")),
    "/gmud/new": lazy(() => import("@/app/gmud/new/page-impl")),
    "/gmud/[id]": lazy(() => import("@/app/gmud/[id]/page-impl")),
    "/apontamentos": lazy(() => import("@/app/apontamentos/page-impl")),
    "/apontamentos/aprovar-horas-extras": lazy(
      () => import("@/app/apontamentos/aprovar-horas-extras/page-impl"),
    ),
    "/apontamentos/aprovar-justificativas": lazy(
      () => import("@/app/apontamentos/aprovar-justificativas/page-impl"),
    ),
    "/apontamentos/carga": lazy(
      () => import("@/app/apontamentos/carga/page-impl"),
    ),
    "/apontamentos/empresa/[companyId]": lazy(
      () => import("@/app/apontamentos/empresa/[companyId]/page-impl"),
    ),
    "/apontamentos/[userId]": lazy(
      () => import("@/app/apontamentos/[userId]/page-impl"),
    ),
    "/inventario": lazy(() => import("@/app/inventario/page-impl")),
    "/inventario/tipo/[assetTypeId]": lazy(
      () => import("@/app/inventario/tipo/[assetTypeId]/page-impl"),
    ),
    "/inventario/[companyId]": lazy(
      () => import("@/app/inventario/[companyId]/page-impl"),
    ),
    "/projetos": lazy(() => import("@/app/projetos/page-impl")),
    "/projetos/[companyId]": lazy(
      () => import("@/app/projetos/[companyId]/page-impl"),
    ),
    "/projetos/[companyId]/[projectId]": lazy(
      () => import("@/app/projetos/[companyId]/[projectId]/page-impl"),
    ),
    "/admin": lazy(() => import("@/app/admin/page-impl")),
    "/admin/auditoria": lazy(() => import("@/app/admin/auditoria/page-impl")),
    "/admin/satisfacao": lazy(
      () => import("@/app/admin/satisfacao/page-impl"),
    ),
    "/admin/acesso": lazy(() => import("@/app/admin/acesso/page-impl")),
    "/admin/classificacao": lazy(
      () => import("@/app/admin/classificacao/page-impl"),
    ),
    "/admin/email": lazy(() => import("@/app/admin/email/page-impl")),
    "/admin/empresas": lazy(() => import("@/app/admin/empresas/page-impl")),
    "/admin/ticket": lazy(() => import("@/app/admin/ticket/page-impl")),
    "/admin/usuarios": lazy(() => import("@/app/admin/usuarios/page-impl")),
  };
