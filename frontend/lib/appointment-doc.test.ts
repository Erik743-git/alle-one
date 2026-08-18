import { describe, expect, it } from "vitest";

import { sanitizeAllowedStyle, sanitizeHref } from "@/lib/appointment-doc";

describe("sanitizeAllowedStyle", () => {
  it("mantém cor e alinhamento seguros", () => {
    expect(sanitizeAllowedStyle("color: #e11d48; text-align: center")).toBe(
      "color: #e11d48; text-align: center",
    );
  });

  it("remove CSS perigoso e propriedades desconhecidas", () => {
    expect(
      sanitizeAllowedStyle(
        "color: red; background: url(javascript:alert(1)); font-size: expression(1)",
      ),
    ).toBe("color: red");
  });
});

describe("sanitizeHref", () => {
  it("aceita http(s) e mailto", () => {
    expect(sanitizeHref("https://alletecnologia.com")).toBe(
      "https://alletecnologia.com",
    );
    expect(sanitizeHref("mailto:a@b.com")).toBe("mailto:a@b.com");
  });

  it("rejeita javascript e data", () => {
    expect(sanitizeHref("javascript:alert(1)")).toBeNull();
    expect(sanitizeHref("data:text/html,hi")).toBeNull();
  });
});
