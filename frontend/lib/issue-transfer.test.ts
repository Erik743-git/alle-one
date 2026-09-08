import { describe, expect, it } from "vitest";
import { getClientProjectsMock } from "./projetos-client-mock";
import { seedIssues, saveIssue } from "./project-issues";
import { applyIssueImport, issueTable, readIssueCsv, writeIssueCsv } from "./issue-transfer";
import { readIssueExcel, writeIssueExcel } from "./issue-excel";
import { defaultIssueTemplates, exportTemplates, importTemplates } from "./issue-templates";
import { serializeAppointmentDoc } from "./appointment-doc";
import { validateIssueDescription } from "./issue-description";
import type { AuthUser } from "./session";
const user: AuthUser = { id: "u", name: "Demo", email: "demo@example.test", role: "CLIENT_MEMBER", companyId: "x", companyName: null, firstAccess: false };
const projects = getClientProjectsMock(user)!.projects;
const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
function data() { const state = seedIssues("x", projects); return saveIssue(state, { ...state.issues[0], title: '=HYPERLINK("https://example.test")', description: serializeAppointmentDoc([{ type: "text", content: 'Descrição; "problema"\nSegunda linha' }, { type: "image", fileIndex: 0, dataUrl: image }]), labels: ["piloto", "teste"], issueType: "BUG" }, projects, state.issues[0].id); }
describe("issue spreadsheet round trips and reusable templates", () => {
  it("round-trips CSV quoting, line breaks, formula-like text and embedded images", () => {
    const state = data(), table = issueTable(state, projects), csv = writeIssueCsv(table);
    expect(csv).toContain("'=HYPERLINK");
    expect(readIssueCsv(csv)).toEqual(table);
    let i = 0; const imported = applyIssueImport({ ...state, issues: [], nextCode: 1 }, projects, readIssueCsv(csv), () => `new-${++i}`);
    expect(imported.issues).toHaveLength(15);
    expect(imported.issues[0].description).toBe(state.issues[0].description);
    expect(imported.issues[1].parentId).toBe(imported.issues[0].id);
    expect(imported.issues[3].blockedByIds).toEqual([imported.issues[2].id]);
  });
  it("round-trips real XLSX with rich content split across cells", async () => {
    const state = data(), table = issueTable(state, projects);
    const index = table.headers.indexOf("Descrição estruturada");
    table.rows[0][index] = serializeAppointmentDoc([{ type: "text", content: "x".repeat(70000) }, { type: "image", fileIndex: 0, dataUrl: image }]);
    const buffer = await writeIssueExcel(table);
    expect(new Uint8Array(buffer).slice(0, 2)).toEqual(new Uint8Array([80, 75]));
    expect(await readIssueExcel(buffer)).toEqual(table);
  });
  it("rejects foreign companies, invalid rows and cyclic imported references atomically", () => {
    const state = data(), table = issueTable(state, projects); let i = 0;
    table.rows[0][table.headers.indexOf("Empresa")] = "foreign";
    expect(() => applyIssueImport(state, projects, table, () => `new-${++i}`)).toThrow(/outra empresa/);
    expect(state.issues).toHaveLength(15);
    const circular = issueTable(state, projects); circular.rows[0][circular.headers.indexOf("Subtarefa de")] = state.issues[1].id;
    expect(() => applyIssueImport(state, projects, circular, () => `new-${++i}`)).toThrow(/hierarquia/);
    expect(() => readIssueCsv('Título;Projeto\n"incompleto')).toThrow(/aspas/);
  });
  it("exports templates portably and assigns imported copies to the current company", () => {
    const templates = defaultIssueTemplates("x"); templates[0].description = data().issues[0].description;
    let i = 0; const imported = importTemplates(exportTemplates(templates), "y", () => `template-${++i}`);
    expect(imported[0].companyId).toBe("y"); expect(imported[0].description).toBe(templates[0].description); expect(imported[0].id).not.toBe(templates[0].id);
    expect(() => importTemplates('{"format":"other"}', "x", () => "id")).toThrow();
  });
  it("rejects remote or executable images and preserves creator on edits", () => {
    expect(() => validateIssueDescription(serializeAppointmentDoc([{ type: "image", fileIndex: 0, dataUrl: "https://example.test/a.png" }]))).toThrow();
    const state = data(), first = state.issues[0];
    const edited = saveIssue(state, { ...first, createdByName: "Outro", createdAt: "2026-09-09" }, projects, first.id);
    expect(edited.issues[0].createdByName).toBe(first.createdByName); expect(edited.issues[0].createdAt).toBe(first.createdAt);
  });
});
