import { describe, expect, it } from "vitest";

import { isPublicRoute } from "./auth";

describe("isPublicRoute", () => {
  it.each([
    ["/login", true],
    ["/satisfacao/abc123", true],
    ["/nps/abc123", true],
    ["/satisfacao", false],
    ["/nps", false],
    ["/admin/satisfacao", false],
    ["/dashboard", false],
  ])("%s → %s", (path, esperado) => {
    expect(isPublicRoute(path)).toBe(esperado);
  });
});
