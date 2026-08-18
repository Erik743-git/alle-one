import { describe, expect, it } from "vitest";

import {
  emailsMatch,
  findByEmail,
  pinCurrentUserFirst,
} from "@/lib/ticket-form";

describe("pinCurrentUserFirst", () => {
  const people = [
    { id: 1, name: "Ana", email: "ana@alle.com" },
    { id: 2, name: "Bruno", email: "bruno@alle.com" },
    { id: 3, name: "Carla", email: "carla@alle.com" },
  ];

  it("move o usuário logado para o início", () => {
    expect(pinCurrentUserFirst(people, "bruno@alle.com").map((p) => p.id)).toEqual(
      [2, 1, 3],
    );
  });

  it("ignora maiúsculas e espaços no e-mail", () => {
    expect(
      pinCurrentUserFirst(people, "  BRUNO@ALLE.COM ").map((p) => p.id),
    ).toEqual([2, 1, 3]);
  });

  it("não altera a lista se o e-mail não estiver nela", () => {
    expect(pinCurrentUserFirst(people, "outro@alle.com")).toEqual(people);
  });
});

describe("emailsMatch / findByEmail", () => {
  it("casa e-mails equivalentes", () => {
    expect(emailsMatch("Ana@Alle.com", " ana@alle.com ")).toBe(true);
    expect(findByEmail([{ email: "bruno@alle.com" }], "BRUNO@alle.com")?.email).toBe(
      "bruno@alle.com",
    );
  });
});
