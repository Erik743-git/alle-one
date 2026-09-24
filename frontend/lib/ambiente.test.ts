import { describe, expect, it } from "vitest";

import { ehAmbienteDeTeste } from "./ambiente";

describe("ehAmbienteDeTeste", () => {
  it("a variável manda quando existe", () => {
    expect(ehAmbienteDeTeste("teste", "portal.alle.com.br")).toBe(true);
    expect(ehAmbienteDeTeste("producao", "teste.alle.com.br")).toBe(false);
  });
  it("sem variável, decide pelo endereço", () => {
    expect(ehAmbienteDeTeste(undefined, "teste.alleone.com.br")).toBe(true);
    expect(ehAmbienteDeTeste(undefined, "alleone-teste.alle.com.br")).toBe(
      true,
    );
    expect(ehAmbienteDeTeste(undefined, "homolog.alle.com.br")).toBe(true);
    expect(ehAmbienteDeTeste(undefined, "portal.alle.com.br")).toBe(false);
    // "testemunha" não é teste
    expect(ehAmbienteDeTeste(undefined, "testemunha.com.br")).toBe(false);
    expect(ehAmbienteDeTeste(undefined, undefined)).toBe(false);
  });
});
