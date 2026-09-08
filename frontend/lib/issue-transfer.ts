import { parseAppointmentDoc, serializeAppointmentDoc } from "@/lib/appointment-doc";
import { ISSUE_PRIORITIES, saveIssue, saveColumn, validateGraph, type Issue, type IssueDraft, type IssueProject, type IssueState } from "@/lib/project-issues";
import { ISSUE_TYPES } from "@/lib/issue-templates";
import { issueDescriptionText } from "@/lib/issue-description";
export const TRANSFER_HEADERS = ["ID", "Empresa", "Código", "Título", "Projeto ID", "Projeto", "Tipo", "Status", "Etapa", "Prioridade", "Descrição", "Descrição estruturada", "Responsáveis IDs", "Responsáveis", "Criado por", "Criado em", "Atualizado em", "Início", "Prazo", "Departamento", "Solicitante", "Categoria", "Centro de custo", "Etiquetas", "Componentes", "Subtarefa de", "Bloqueada por", "Depende de"];
export type IssueTable = { headers: string[]; rows: string[][] };
export function issueTable(state: IssueState, projects: IssueProject[]): IssueTable {
  return { headers: TRANSFER_HEADERS, rows: state.issues.map((i) => { const assigneeIds = i.assigneeIds ?? (i.assigneeId ? [i.assigneeId] : []); return [i.id, state.companyId, `DEM-${i.code}`, i.title, i.projectId, projects.find((p) => p.id === i.projectId)?.name ?? "", i.issueType ?? "TASK", state.columns.find((c) => c.id === i.status)?.name ?? i.status, state.columns.find((c) => c.id === i.status)?.category ?? "TODO", i.priority, issueDescriptionText(i.description), i.description, assigneeIds.join(" | "), assigneeIds.map((id) => state.users.find((user) => user.id === id)?.name).filter(Boolean).join(" | "), i.createdByName ?? "", i.createdAt ?? "", i.updatedAt ?? "", i.startDate, i.dueDate, i.department ?? "", i.requester ?? "", i.category ?? "", i.costCenter ?? "", (i.labels ?? []).join(" | "), i.components ?? "", i.parentId ?? "", (i.blockedByIds ?? []).join(" | "), (i.dependsOnIds ?? []).join(" | ")]; }) };
}
const escapeCell = (value: string) => /^[=+@\-\t\r']/.test(value) ? `'${value}` : value;
const unescapeCell = (value: string) => /^'[=+@\-\t\r']/.test(value) ? value.slice(1) : value;
export function writeIssueCsv(table: IssueTable) {
  return "\uFEFF" + [table.headers, ...table.rows].map((row) => row.map((value) => `"${escapeCell(value).replace(/"/g, '""')}"`).join(";")).join("\r\n");
}
export function readIssueCsv(raw: string): IssueTable {
  raw = raw.replace(/^\uFEFF/, "");
  if (raw.length > 15000000) throw new Error("O CSV deve ter até 15 MB.");
  const first = raw.split(/\r?\n/, 1)[0];
  const separator = first.includes(";") ? ";" : ",";
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '"') { if (quoted && raw[i + 1] === '"') { cell += '"'; i++; } else if (quoted || cell === "") quoted = !quoted; else throw new Error("Aspas inválidas no CSV."); }
    else if (!quoted && ch === separator) { row.push(unescapeCell(cell)); cell = ""; }
    else if (!quoted && (ch === "\n" || ch === "\r")) { if (ch === "\r" && raw[i + 1] === "\n") i++; row.push(unescapeCell(cell)); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (quoted) throw new Error("O CSV tem um campo com aspas não fechadas.");
  if (cell || row.length) { row.push(unescapeCell(cell)); rows.push(row); }
  const headers = rows.shift() ?? [];
  if (!headers.length || rows.some((r) => r.length !== headers.length)) throw new Error("As linhas do CSV devem ter a mesma quantidade de colunas.");
  return { headers, rows };
}
export function applyIssueImport(current: IssueState, projects: IssueProject[], table: IssueTable, newId: () => string): IssueState {
  if (!table.rows.length || table.rows.length > 1000 || !["Título", "Projeto"].every((h) => table.headers.includes(h))) throw new Error("Use até 1.000 demandas e inclua as colunas Título e Projeto.");
  if (new Set(table.headers).size !== table.headers.length) throw new Error("O arquivo tem cabeçalhos duplicados.");
  let state = { ...current, issues: [...current.issues], columns: [...current.columns] };
  const ids = new Map<string, string>(), rows = table.rows.map((r) => Object.fromEntries(table.headers.map((h, i) => [h, r[i] ?? ""])));
  rows.forEach((r, index) => { const key = r.ID || `row-${index}`; if (ids.has(key)) throw new Error(`Linha ${index + 2}: ID duplicado.`); ids.set(key, newId()); });
  const pending: Array<{ id: string; row: Record<string, string> }> = [];
  rows.forEach((r, index) => {
    try {
      if (r.Empresa && r.Empresa !== current.companyId) throw new Error("O registro pertence a outra empresa.");
      const project = projects.find((p) => p.companyId === current.companyId && (r["Projeto ID"] ? p.id === r["Projeto ID"] : p.name === r.Projeto));
      if (!project) throw new Error("Projeto não encontrado na empresa ativa.");
      const name = r.Status || "A fazer";
      let column = state.columns.find((c) => c.name === name || c.id === name);
      if (!column) { const category = r.Etapa || "TODO"; state = saveColumn(state, { id: newId(), name, width: 304, category: category as "TODO" }); column = state.columns.at(-1)!; }
      const assigneeIdsInput = r["Responsáveis IDs"] || r["Responsável ID"] || "";
      const assigneeNamesInput = r.Responsáveis || r.Responsável || "";
      const useIds = !!assigneeIdsInput && !assigneeNamesInput;
      const requested = (useIds ? assigneeIdsInput : assigneeNamesInput).split("|").map((value) => value.trim()).filter(Boolean);
      const assignees = requested.map((value) => state.users.find((u) => useIds ? u.id === value : u.name === value));
      if (assignees.some((owner) => !owner)) throw new Error("Um ou mais responsáveis não foram encontrados na empresa ativa.");
      const type = r.Tipo || "TASK", priority = r.Prioridade || "MEDIUM";
      const issueType = Object.hasOwn(ISSUE_TYPES, type) ? type : Object.entries(ISSUE_TYPES).find(([, label]) => label === type)?.[0];
      const mappedPriority = Object.hasOwn(ISSUE_PRIORITIES, priority) ? priority : Object.entries(ISSUE_PRIORITIES).find(([, label]) => label === priority)?.[0];
      const id = ids.get(r.ID || `row-${index}`)!;
      let description = r["Descrição estruturada"] || r.Descrição || "";
      if (r["Descrição estruturada"] && r.Descrição !== undefined && r.Descrição !== issueDescriptionText(description)) {
        const images = parseAppointmentDoc(description)?.blocks.filter((b) => b.type === "image") ?? [];
        description = images.length ? serializeAppointmentDoc([{ type: "text", content: r.Descrição }, ...images]) : r.Descrição;
      }
      const assigneeIds = assignees.flatMap((owner) => owner ? [owner.id] : []);
      const draft: IssueDraft = { title: r.Título, projectId: project.id, description, status: column.id, priority: mappedPriority as Issue["priority"], issueType: issueType as Issue["issueType"], assignee: "", assigneeId: assigneeIds[0] ?? null, assigneeIds, startDate: r.Início || "", dueDate: r.Prazo || "", createdByName: r["Criado por"] || "Importação", createdAt: r["Criado em"] || undefined, department: r.Departamento || "", requester: r.Solicitante || "", category: r.Categoria || "", costCenter: r["Centro de custo"] || "", labels: (r.Etiquetas || "").split("|").map((v) => v.trim()).filter(Boolean), components: r.Componentes || "" };
      if (!issueType || !mappedPriority) throw new Error("Tipo ou prioridade desconhecidos.");
      state = saveIssue(state, draft, projects, id); pending.push({ id, row: r });
    } catch (err) { throw new Error(`Linha ${index + 2}: ${err instanceof Error ? err.message : "registro inválido"}`); }
  });
  const resolve = (value: string): string => { const found = ids.get(value) ?? current.issues.find((i) => i.id === value || `DEM-${i.code}` === value)?.id; if (!found) throw new Error(`Vínculo não encontrado: ${value}`); return found; };
  const list = (value: string) => value.split("|").map((v) => v.trim()).filter(Boolean).map(resolve);
  state.issues = state.issues.map((issue) => { const r = pending.find((p) => p.id === issue.id)?.row; return r ? { ...issue, parentId: r["Subtarefa de"] ? resolve(r["Subtarefa de"]) : null, blockedByIds: list(r["Bloqueada por"] || ""), dependsOnIds: list(r["Depende de"] || "") } : issue; });
  validateGraph(state.issues);
  return state;
}
