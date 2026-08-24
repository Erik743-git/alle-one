import { afterEach, describe, expect, it, vi } from "vitest";

describe("getBrowserApiBase", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("preserva prefixo /api na mesma origem", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_API_URL",
      "https://alleone-teste.alletecnologia.com/api",
    );

    vi.stubGlobal("window", {
      location: { origin: "https://alleone-teste.alletecnologia.com" },
    });

    const { getBrowserApiBase, buildApiUrl } = await import("./env");
    expect(getBrowserApiBase()).toBe("/api");
    expect(buildApiUrl("/tickets")).toBe("/api/tickets");
  });

  it("usa URL absoluta quando a porta ou host difere", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://127.0.0.1:3002");

    vi.stubGlobal("window", {
      location: { origin: "http://localhost:3000" },
    });

    const { getBrowserApiBase, buildApiUrl } = await import("./env");
    expect(getBrowserApiBase()).toBe("http://127.0.0.1:3002");
    expect(buildApiUrl("/tickets")).toBe("http://127.0.0.1:3002/tickets");
  });

  it("retorna path vazio quando API está na raiz da mesma origem", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://alleone.alletecnologia.com");

    vi.stubGlobal("window", {
      location: { origin: "https://alleone.alletecnologia.com" },
    });

    const { getBrowserApiBase, buildApiUrl } = await import("./env");
    expect(getBrowserApiBase()).toBe("");
    expect(buildApiUrl("/tickets")).toBe("/tickets");
  });
});
