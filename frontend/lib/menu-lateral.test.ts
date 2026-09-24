import { describe, expect, it } from "vitest";

import { aplicarPreferenciaMenu } from "./menu-lateral";

const itens = ["dashboard", "tickets", "gmud", "financeiro", "projetos"].map(
  (chave) => ({ chave }),
);
const chaves = (r: Array<{ chave: string; visivel: boolean }>) =>
  r.map((i) => `${i.chave}${i.visivel ? "" : "-"}`);

describe("aplicarPreferenciaMenu", () => {
  it("sem preferência: ordem padrão, tudo visível", () => {
    expect(chaves(aplicarPreferenciaMenu(itens, null))).toEqual([
      "dashboard",
      "tickets",
      "gmud",
      "financeiro",
      "projetos",
    ]);
  });

  it("em construção começa escondido; a escolha da pessoa manda", () => {
    const r = aplicarPreferenciaMenu(
      itens,
      { ordem: [], visivel: { projetos: true } },
      ["financeiro", "projetos"],
    );
    expect(chaves(r)).toEqual([
      "dashboard",
      "tickets",
      "gmud",
      "financeiro-",
      "projetos",
    ]);
    expect(r.find((i) => i.chave === "financeiro")?.emConstrucao).toBe(true);
  });

  it("ordem escolhida; item novo vai para o fim; chave sem acesso é ignorada", () => {
    const r = aplicarPreferenciaMenu(itens, {
      ordem: ["gmud", "mural", "dashboard"],
      visivel: { tickets: false },
    });
    expect(chaves(r)).toEqual([
      "gmud",
      "dashboard",
      "tickets-",
      "financeiro",
      "projetos",
    ]);
  });

  it("console conta como monitoramento para a construção", () => {
    const r = aplicarPreferenciaMenu([{ chave: "console" }], null, [
      "monitoramento",
    ]);
    expect(r[0]).toMatchObject({ visivel: false, emConstrucao: true });
  });
});
