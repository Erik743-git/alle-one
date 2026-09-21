import { describe, expect, it } from "vitest";

import {
  MESAS_PADRAO_NO_GRAFICO,
  deskNamesFromRows,
  deskValue,
  resolveVisibleDesks,
} from "./dashboard-desks";
import type { DashboardMesRow } from "./services/dashboard.service";

function linha(
  monthKey: string,
  mesas: Record<string, number>,
): DashboardMesRow {
  const total = Object.values(mesas).reduce((soma, n) => soma + n, 0);
  return { monthKey, monthLabel: monthKey, Total: total, ...mesas };
}

/** As 9 mesas que existem hoje, com movimento decrescente. */
const rows = [
  linha("2026-08", {
    Infraestrutura: 40,
    Sistemas: 35,
    NOC: 20,
    Rotinas: 15,
    Projetos: 10,
    Consult: 6,
    Alleone: 4,
    "Protheus/BI - Fluidra": 2,
    Triagem: 1,
  }),
];

describe("deskNamesFromRows", () => {
  it("lista da mesa com mais movimento para a com menos", () => {
    expect(deskNamesFromRows(rows).slice(0, 3)).toEqual([
      "Infraestrutura",
      "Sistemas",
      "NOC",
    ]);
  });

  it("não trata campo da linha como mesa", () => {
    const nomes = deskNamesFromRows(rows);
    expect(nomes).not.toContain("Total");
    expect(nomes).not.toContain("monthKey");
    expect(nomes).not.toContain("monthLabel");
  });

  it("enxerga todas as mesas, não só as 5 antigas", () => {
    // O gráfico antigo tinha 5 categorias fixas e Projetos, Alleone,
    // Triagem e Protheus/BI caíam somadas dentro de "Sistema".
    expect(deskNamesFromRows(rows)).toHaveLength(9);
    expect(deskNamesFromRows(rows)).toContain("Projetos");
    expect(deskNamesFromRows(rows)).toContain("Triagem");
  });
});

describe("resolveVisibleDesks", () => {
  it("sem escolha salva, mostra as mais movimentadas e não todas", () => {
    const visiveis = resolveVisibleDesks(rows, []);
    expect(visiveis).toHaveLength(MESAS_PADRAO_NO_GRAFICO);
    expect(visiveis).toEqual([
      "Infraestrutura",
      "Sistemas",
      "NOC",
      "Rotinas",
      "Projetos",
    ]);
  });

  it("trata preset ausente igual a preset vazio", () => {
    expect(resolveVisibleDesks(rows, undefined)).toHaveLength(
      MESAS_PADRAO_NO_GRAFICO,
    );
  });

  it("respeita exatamente o que a pessoa marcou", () => {
    expect(resolveVisibleDesks(rows, ["Triagem", "Projetos"])).toEqual([
      "Projetos",
      "Triagem",
    ]);
  });

  it("pode mostrar todas as mesas quando a pessoa marca todas", () => {
    const todas = deskNamesFromRows(rows);
    expect(resolveVisibleDesks(rows, todas)).toHaveLength(9);
  });

  it("ignora mesa marcada que não teve movimento no período", () => {
    // Senão a série fica pendurada vazia depois de mudar as datas.
    expect(resolveVisibleDesks(rows, ["Projetos", "Mesa Extinta"])).toEqual([
      "Projetos",
    ]);
  });

  it("cai no padrão quando nenhuma mesa marcada teve movimento", () => {
    const visiveis = resolveVisibleDesks(rows, ["Mesa Extinta"]);
    expect(visiveis).toHaveLength(MESAS_PADRAO_NO_GRAFICO);
  });

  it("sem dado nenhum, não inventa série", () => {
    expect(resolveVisibleDesks([], ["Projetos"])).toEqual([]);
    expect(resolveVisibleDesks([], [])).toEqual([]);
  });
});

describe("deskValue", () => {
  it("devolve 0 para mês sem movimento na mesa", () => {
    const row = linha("2026-08", { NOC: 3 });
    expect(deskValue(row, "NOC")).toBe(3);
    expect(deskValue(row, "Projetos")).toBe(0);
  });

  it("não devolve texto quando o nome bate com campo da linha", () => {
    const row = linha("2026-08", { NOC: 3 });
    expect(deskValue(row, "monthLabel")).toBe(0);
  });
});
