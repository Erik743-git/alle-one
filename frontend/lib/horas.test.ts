import { describe, expect, it } from "vitest";

import { dataBr, formatarMinutos } from "./horas";

describe("horas", () => {
  it("formata minutos", () => {
    expect(formatarMinutos(0)).toBe("0h00");
    expect(formatarMinutos(1799)).toBe("29h59");
    expect(formatarMinutos(-5)).toBe("0h00");
  });
  it("data brasileira", () => {
    expect(dataBr("2026-09-25")).toBe("25/09/2026");
  });
});
