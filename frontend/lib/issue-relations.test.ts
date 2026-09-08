import { describe, expect, it } from "vitest";
import { defaultColumns, getIssueDraft, issueActivities, mockIssueUsers, removeIssue, restoreIssues, saveColumn, saveIssue, seedIssues, type IssueDraft } from "./project-issues";
import { getClientProjectsMock } from "./projetos-client-mock";
import type { AuthUser } from "./session";
const user: AuthUser = { id: "u", name: "Demo", email: "demo@example.test", companyId: "x", companyName: null, role: "CLIENT_MEMBER", firstAccess: false };
const projects = getClientProjectsMock(user)!.projects;
const draft: IssueDraft = { title: "Teste", description: "", projectId: projects[0].id, status: "TODO", priority: "HIGH", assignee: "", startDate: "", dueDate: "" };
const empty = () => ({ ...seedIssues("x", projects), issues: [], nextCode: 1 });
describe("relationships, directory, columns and migration", () => {
  it("maintains both directions, rejects cycles and cleans links on deletion", () => {
    let state = saveIssue(saveIssue(empty(), draft, projects, "a"), draft, projects, "b");
    state = saveIssue(state, { ...draft, blocksIds: ["b"] }, projects, "a");
    expect(state.issues.find((i) => i.id === "b")!.blockedByIds).toEqual(["a"]);
    expect(getIssueDraft(state.issues[0], state).blocksIds).toEqual(["b"]);
    expect(() => saveIssue(state, { ...draft, dependsOnIds: ["b"] }, projects, "a")).toThrow(/circular/);
    expect(() => saveIssue(state, { ...draft, blockedByIds: ["a"] }, projects, "a")).toThrow(/circular/);
    expect(() => saveIssue(state, { ...draft, blocksIds: ["foreign"] }, projects, "a")).toThrow();
    state = saveIssue(state, { ...getIssueDraft(state.issues[0], state), blocksIds: [] }, projects, "a");
    expect(state.issues[1].blockedByIds).toEqual([]);
    state = saveIssue(state, { ...draft, dependencyOfIds: ["b"] }, projects, "a");
    expect(state.issues[1].dependsOnIds).toEqual(["a"]);
    state = removeIssue(state, "a");
    expect(state.issues[0].dependsOnIds).toEqual([]);
  });
  it("renders a hierarchy, prevents hierarchy cycles and promotes children on deletion", () => {
    let state = saveIssue(saveIssue(empty(), draft, projects, "a"), { ...draft, parentId: "a" }, projects, "b");
    expect(issueActivities(state.issues, projects[0].id)[0].children[0].id).toBe("b");
    expect(() => saveIssue(state, { ...draft, parentId: "b" }, projects, "a")).toThrow(/hierarquia/);
    expect(() => saveIssue(state, { ...draft, projectId: projects[1].id, parentId: "a" }, projects, "b")).toThrow(/mesmo projeto/);
    state = removeIssue(state, "a");
    expect(state.issues[0].parentId).toBeNull();
  });
  it("validates company users and reflects assignments in schedules", () => {
    const owner = mockIssueUsers("x")[0];
    const state = saveIssue(empty(), { ...draft, assigneeId: owner.id }, projects, "a");
    expect(issueActivities(state.issues, projects[0].id)[0].assigneeUserId).toBe(owner.id);
    expect(state.issues[0].assignee).toBe(owner.name);
    expect(() => saveIssue(state, { ...draft, assigneeId: mockIssueUsers("foreign")[0].id }, projects, "a")).toThrow();
  });
  it("persists custom columns and widths and maps their category to Gantt progress", () => {
    let state = saveColumn(empty(), { id: "qa", name: "Validação", width: 450, category: "REVIEW" });
    state = saveIssue(state, { ...draft, status: "qa" }, projects, "a");
    expect(issueActivities(state.issues, projects[0].id, state.columns)[0].progressPercent).toBe(90);
    expect(restoreIssues(JSON.stringify(state), "x", projects)).toEqual(state);
    expect(saveColumn(state, { ...state.columns[4], width: 10 }).columns[4].width).toBe(240);
    expect(() => saveColumn(state, { ...state.columns[4], id: "other" })).toThrow(/existe/);
  });
  it("migrates existing local records without discarding edits", () => {
    const state = saveIssue(empty(), { ...draft, title: "Edição anterior" }, projects, "a");
    const restored = restoreIssues(JSON.stringify({ version: 1, companyId: "x", nextCode: 2, issues: state.issues }), "x", projects);
    expect(restored.version).toBe(2);
    expect(restored.issues[0].title).toBe("Edição anterior");
    expect(restored.columns).toEqual(defaultColumns());
  });
});
