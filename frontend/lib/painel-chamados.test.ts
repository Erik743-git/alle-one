import { describe, expect, it } from "vitest";
import {
  agruparParados,
  filtrarParados,
  formatarTempoParado,
  opcoesFiltro,
  totaisParados,
  type ChamadoParado,
} from "./painel-chamados";

function parado(over: Partial<ChamadoParado>): ChamadoParado {
  return {
    ticketNumber: 1,
    titulo: "Servidor fora",
    empresaChave: "10",
    empresa: "Fluidra",
    responsavelChave: "99",
    responsavel: "Otávio",
    abertoEm: "2026-09-20T12:00:00.000Z",
    horasParado: 10,
    mais48h: false,
    semResponsavel: false,
    ...over,
  };
}

// Já vem do mais antigo para o mais novo, como a API manda.
const linhas = [
  parado({ ticketNumber: 1, empresaChave: "20", empresa: "Zanotti", horasParado: 200, mais48h: true }),
  parado({ ticketNumber: 2, responsavelChave: "sem", responsavel: "Sem responsável", semResponsavel: true, horasParado: 60, mais48h: true }),
  parado({ ticketNumber: 3 }),
];

describe("agrupar", () => {
  it("por empresa, na ordem de quem tem o chamado mais antigo", () => {
    const grupos = agruparParados(linhas, "empresa");
    expect(grupos.map((g) => g.nome)).toEqual(["Zanotti", "Fluidra"]);
    expect(grupos[1].linhas.map((l) => l.ticketNumber)).toEqual([2, 3]);
  });

  it("por responsável, com subtotal de mais de 48h", () => {
    const grupos = agruparParados(linhas, "responsavel");
    const otavio = grupos.find((g) => g.chave === "99");
    expect(otavio?.linhas).toHaveLength(2);
    expect(otavio?.mais48h).toBe(1);
    expect(grupos.find((g) => g.chave === "sem")?.nome).toBe("Sem responsável");
  });
});

describe("filtros e contador do topo", () => {
  it("combina empresa, responsável e só mais de 48h", () => {
    expect(
      filtrarParados(linhas, { empresa: "10", responsavel: "", so48h: true }).map((l) => l.ticketNumber),
    ).toEqual([2]);
  });

  it("conta o que está visível", () => {
    expect(totaisParados(linhas)).toEqual({ total: 3, mais48h: 2, semResponsavel: 1 });
  });

  it("opções do filtro, uma vez cada, com a quantidade", () => {
    expect(opcoesFiltro(linhas, "empresa")).toEqual([
      { value: "10", label: "Fluidra (2)" },
      { value: "20", label: "Zanotti (1)" },
    ]);
  });
});

describe("tempo parado", () => {
  it("mostra horas corridas, e os dias quando passa de 48h", () => {
    expect(formatarTempoParado(47)).toBe("47h");
    expect(formatarTempoParado(52)).toBe("52h (2 dias)");
  });
});
