import { describe, expect, it } from "vitest";

import {
  campoBrasiliaParaIso,
  diaBrasilia,
  horaBrasilia,
  isoParaCampoBrasilia,
} from "./fuso-brasilia";

describe("fuso de Brasília", () => {
  it("02h UTC de quarta ainda é 23h de terça em Brasília", () => {
    expect(diaBrasilia("2026-09-23T02:00:00Z")).toBe("2026-09-22");
    expect(horaBrasilia("2026-09-23T02:00:00Z")).toBe("23:00");
  });

  it("campo do formulário vira instante e volta igual", () => {
    const iso = campoBrasiliaParaIso("2026-09-25T22:30");
    expect(iso).toBe("2026-09-26T01:30:00.000Z");
    expect(isoParaCampoBrasilia(iso!)).toBe("2026-09-25T22:30");
  });

  it("campo vazio ou torto não vira data", () => {
    expect(campoBrasiliaParaIso("")).toBeNull();
    expect(campoBrasiliaParaIso("25/09/2026 22:30")).toBeNull();
  });
});
