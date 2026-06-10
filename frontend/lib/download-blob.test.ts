import { describe, expect, it } from "vitest";

import { parseContentDispositionFilename } from "@/lib/download-blob";

describe("parseContentDispositionFilename", () => {
  it("lê filename entre aspas", () => {
    expect(
      parseContentDispositionFilename('attachment; filename="relatorio.csv"', "x"),
    ).toBe("relatorio.csv");
  });

  it("lê filename UTF-8", () => {
    expect(
      parseContentDispositionFilename(
        "attachment; filename*=UTF-8''relat%C3%B3rio.csv",
        "x",
      ),
    ).toBe("relatório.csv");
  });

  it("usa fallback quando header vazio", () => {
    expect(parseContentDispositionFilename("", "padrao.pdf")).toBe("padrao.pdf");
  });
});
