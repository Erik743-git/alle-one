import { describe, expect, it } from "vitest";
import { getClientProjectsMock } from "./projetos-client-mock";
import type { AuthUser } from "./session";

function user(role: AuthUser["role"], companyId: string | null): AuthUser {
  return { id: "user-1", name: "Demo", email: "demo@example.test", role, companyId, companyName: null, firstAccess: false };
}

describe("client project mock scope", () => {
  it.each(["CLIENT_GESTOR", "CLIENT_MEMBER", "CLIENT"] as const)("scopes %s to the active company", (role) => {
    const session = user(role, "company-x");
    const result = getClientProjectsMock(session)!;
    expect(result.projects).toHaveLength(3);
    expect(result.projects.every((p) => p.companyId === "company-x")).toBe(true);
    expect(getClientProjectsMock(session, "company-y")).toBeNull();
    const foreign = getClientProjectsMock(user(role, "company-y"))!.projects[0];
    expect(getClientProjectsMock(session, "company-x", foreign.id)).toBeNull();
    expect(getClientProjectsMock(session, "company-x", result.projects[0].id)?.project?.id).toBe(result.projects[0].id);
  });
  it("denies missing sessions, missing companies and internal users", () => {
    expect(getClientProjectsMock(null)).toBeNull();
    expect(getClientProjectsMock(user("CLIENT_MEMBER", null))).toBeNull();
    expect(getClientProjectsMock(user("ADMIN", "company-x"))).toBeNull();
  });
  it("does not accept inactive memberships or stale project links after switching companies", () => {
    const session = user("CLIENT_GESTOR", "company-x");
    session.companies = [{ id: "company-y", name: "Y", clientRole: "CLIENT_GESTOR" }];
    expect(getClientProjectsMock(session, "company-y")).toBeNull();
    const project = getClientProjectsMock(session)!.projects[0];
    expect(getClientProjectsMock({ ...session, companyId: "company-y" }, "company-x", project.id)).toBeNull();
    expect(getClientProjectsMock(session, "company-x", "missing")).toBeNull();
  });
});
