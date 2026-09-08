import { describe, expect, it } from "vitest";
import { getClientProjectsMock } from "./projetos-client-mock";
import { issueActivities, removeIssue, restoreIssues, saveIssue, seedIssues, type IssueDraft } from "./project-issues";
import type { AuthUser } from "./session";

const user: AuthUser = { id: "u", name: "Demo", email: "demo@example.test", companyId: "x", companyName: null, role: "CLIENT_MEMBER", firstAccess: false };
const projects = getClientProjectsMock(user)!.projects;
const draft: IssueDraft = { title: "Nova entrega", description: "Detalhes", projectId: projects[0].id, status: "TODO", priority: "HIGH", assignee: "Equipe", startDate: "2026-09-01", dueDate: "2026-09-10" };

describe("mock issue CRUD and schedule synchronization", () => {
  it("creates, edits, moves between projects, completes and deletes the same record", () => {
    let state = seedIssues("x", projects);
    state = saveIssue(state, draft, projects, "new");
    const code = state.issues.find((i) => i.id === "new")!.code;
    expect(issueActivities(state.issues, projects[0].id).find((a) => a.id === "new")?.name).toBe(draft.title);
    state = saveIssue(state, { ...draft, title: "Entrega revisada", projectId: projects[1].id, status: "REVIEW" }, projects, "new");
    expect(state.issues.find((i) => i.id === "new")?.code).toBe(code);
    expect(issueActivities(state.issues, projects[0].id).some((a) => a.id === "new")).toBe(false);
    expect(issueActivities(state.issues, projects[1].id).find((a) => a.id === "new")?.progressPercent).toBe(90);
    state = saveIssue(state, { ...draft, status: "DONE" }, projects, "new");
    expect(issueActivities(state.issues, projects[0].id).find((a) => a.id === "new")?.activityStatus).toBe("COMPLETED");
    state = removeIssue(state, "new");
    expect(state.issues.some((i) => i.id === "new")).toBe(false);
    expect(state.nextCode).toBe(code + 1);
  });
  it("restores edits and an intentionally empty board without reseeding", () => {
    const state = saveIssue(seedIssues("x", projects), draft, projects, "new");
    expect(restoreIssues(JSON.stringify(state), "x", projects)).toEqual(state);
    expect(restoreIssues(JSON.stringify({ ...state, issues: [] }), "x", projects).issues).toEqual([]);
  });
  it("rejects foreign projects and foreign or corrupted storage", () => {
    const state = seedIssues("x", projects);
    expect(() => saveIssue(state, { ...draft, projectId: "foreign" }, projects, "new")).toThrow();
    for (const raw of ["invalid", JSON.stringify({ ...state, companyId: "y" }), JSON.stringify({ ...state, issues: [{ ...state.issues[0], status: "__proto__" }] }), JSON.stringify({ ...state, issues: [{ ...state.issues[0], companyId: "y" }] }), JSON.stringify({ ...state, issues: [state.issues[0], state.issues[0]] })]) {
      expect(restoreIssues(raw, "x", projects)).toEqual(state);
    }
  });
  it("validates titles and date ranges before saving", () => {
    const state = seedIssues("x", projects);
    for (const patch of [{ title: "   " }, { dueDate: "2026-08-31" }, { dueDate: "2026-02-30" }]) {
      expect(() => saveIssue(state, { ...draft, ...patch }, projects, "new")).toThrow();
    }
  });
});
