import { afterEach, describe, expect, it, vi } from "vitest";

describe("buildAuthApiUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("usa /api/auth na mesma origem com prefixo /api", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://alleone.alletecnologia.com/api");
    vi.stubGlobal("window", {
      location: { origin: "https://alleone.alletecnologia.com" },
    });

    const { buildAuthApiUrl } = await import("./auth-api-url");
    expect(buildAuthApiUrl("/login")).toBe(
      "https://alleone.alletecnologia.com/api/auth/login",
    );
  });

  it("mantém /auth na raiz quando API não tem prefixo /api", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://alleone.alletecnologia.com");
    vi.stubGlobal("window", {
      location: { origin: "https://alleone.alletecnologia.com" },
    });

    const { buildAuthApiUrl } = await import("./auth-api-url");
    expect(buildAuthApiUrl("/login")).toBe(
      "https://alleone.alletecnologia.com/auth/login",
    );
  });
});
