import { describe, expect, it } from "vitest";
import {
  formatApprovedAt,
  formatDateBr,
  formatDateDisplay,
  formatDateTime,
} from "./date-utils";

describe("formatDateBr", () => {
  it("formata yyyy-MM-dd", () => {
    expect(formatDateBr("2026-08-26")).toBe("26/08/2026");
  });

  it("retorna original se inválido", () => {
    expect(formatDateBr("invalid")).toBe("invalid");
  });
});

describe("formatDateDisplay", () => {
  it("formata data ISO", () => {
    expect(formatDateDisplay("2026-08-26T12:00:00.000Z")).toMatch(/26\/08\/2026/);
  });

  it("retorna fallback para null", () => {
    expect(formatDateDisplay(null)).toBe("—");
  });
});

describe("formatDateTime", () => {
  it("formata ISO com hora", () => {
    const out = formatDateTime("2026-08-26T15:30:00.000Z");
    expect(out).toMatch(/26\/08\/2026/);
  });
});

describe("formatApprovedAt", () => {
  it("retorna traço para null", () => {
    expect(formatApprovedAt(null)).toBe("—");
  });
});
