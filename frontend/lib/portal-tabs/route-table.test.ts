import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

import { PORTAL_TAB_ROUTES, matchPortalRoute } from "./route-table";

describe("matchPortalRoute", () => {
  it.each([
    ["/dashboard", "/dashboard", {}],
    ["/tickets/new", "/tickets/new", {}],
    ["/tickets/pre-tickets", "/tickets/pre-tickets", {}],
    ["/tickets/81247", "/tickets/[ticketNumber]", { ticketNumber: "81247" }],
    [
      "/tickets/81247/edit",
      "/tickets/[ticketNumber]/edit",
      { ticketNumber: "81247" },
    ],
    ["/gmud/new", "/gmud/new", {}],
    ["/gmud/abc?mode=edit", "/gmud/[id]", { id: "abc" }],
    [
      "/apontamentos/aprovar-horas-extras",
      "/apontamentos/aprovar-horas-extras",
      {},
    ],
    ["/apontamentos/u1", "/apontamentos/[userId]", { userId: "u1" }],
    [
      "/inventario/tipo/t1",
      "/inventario/tipo/[assetTypeId]",
      { assetTypeId: "t1" },
    ],
    [
      "/projetos/c1/p%201",
      "/projetos/[companyId]/[projectId]",
      { companyId: "c1", projectId: "p 1" },
    ],
  ])("%s → %s", (path, route, params) => {
    expect(matchPortalRoute(path)).toEqual({ route, params });
  });

  it("não abre em guia o que não é tela do portal", () => {
    expect(matchPortalRoute("/login")).toBeNull();
    expect(matchPortalRoute("/")).toBeNull();
    expect(matchPortalRoute("/tickets/1/2/3")).toBeNull();
  });

  it("cobre todas as telas autenticadas de app/", () => {
    const appDir = join(__dirname, "..", "..", "app");
    const publicas = new Set([
      "/",
      "/login",
      "/esqueci-senha",
      "/primeiro-acesso",
      "/redefinir-senha",
    ]);
    const rotas: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (name === "page.tsx") {
          const rel = relative(appDir, dir).split(sep).join("/");
          rotas.push(rel ? `/${rel}` : "/");
        }
      }
    };
    walk(appDir);
    const autenticadas = rotas.filter((rota) => !publicas.has(rota)).sort();
    expect([...PORTAL_TAB_ROUTES].sort()).toEqual(autenticadas);
  });
});
