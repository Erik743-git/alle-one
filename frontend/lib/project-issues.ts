import { ISSUE_TYPES, defaultIssueTemplates, validateTemplate, type IssueType, type IssueTemplate } from "@/lib/issue-templates";
import { validateIssueDescription } from "@/lib/issue-description";
import type { ProjectActivity } from "@/lib/services/projetos.service";
export const ISSUE_STATUSES = { TODO: "A fazer", IN_PROGRESS: "Em andamento", REVIEW: "Em revisão", DONE: "Concluído" } as const;
export const ISSUE_PRIORITIES = { LOW: "Baixa", MEDIUM: "Média", HIGH: "Alta", URGENT: "Urgente" } as const;
export type IssueStatus = string;
export type IssuePriority = keyof typeof ISSUE_PRIORITIES;
export type IssueUser = { id: string; companyId: string; name: string; role: string; color: string; face: number };
export type IssueColumn = { id: string; name: string; width: number; category: keyof typeof ISSUE_STATUSES };
export type Issue = { issueType?: IssueType; createdByName?: string; createdAt?: string; updatedAt?: string; department?: string; requester?: string; category?: string; costCenter?: string; labels?: string[]; components?: string; id: string; companyId: string; projectId: string; code: number; title: string; description: string; status: string; priority: IssuePriority; assignee: string; assigneeId?: string | null; assigneeIds?: string[]; startDate: string; dueDate: string; parentId?: string | null; blockedByIds?: string[]; dependsOnIds?: string[] };
export type IssueProject = { id: string; companyId: string; name: string; activities: ProjectActivity[] };
export type IssueDraft = Omit<Issue, "id" | "companyId" | "code"> & { blocksIds?: string[]; dependencyOfIds?: string[] };
export type IssueState = { version: 3; companyId: string; nextCode: number; issues: Issue[]; columns: IssueColumn[]; users: IssueUser[]; templates?: IssueTemplate[] };
export const defaultColumns = (): IssueColumn[] => Object.entries(ISSUE_STATUSES).map(([id, name]) => ({ id, name, width: 304, category: id as IssueColumn["category"] }));
export function mockIssueUsers(companyId: string): IssueUser[] {
  return [["Marina Azevedo", "Gestão de projetos", "#f1b5a0"], ["Rafael Nogueira", "Infraestrutura", "#97c5e5"], ["Bianca Torres", "Qualidade", "#c3b1ec"], ["Lucas Valença", "Segurança", "#a6d4b9"], ["Camila Duarte", "UI/UX", "#edcc89"], ["Diego Martins", "Desenvolvimento", "#8dc9c1"], ["Helena Prado", "Operações", "#d6a7bf"]].map(([name, role, color], index) => ({ id: `${companyId}:demo-user-${index}`, companyId, name, role, color, face: index % 5 }));
}
const scenarios = [
  [["Preparar migração do ambiente de homologação", "Mapear serviços e validar o plano de rollback. Aceite: ambiente acessível e checklist revisado.", "IN_PROGRESS", "HIGH", [0, 1]], ["Provisionar máquinas virtuais e volumes", "Criar instâncias para aplicação, banco e monitoramento. Aplicar limites de recursos e política de backup.", "DONE", "MEDIUM", [1, 3]], ["Revisar regras de firewall da aplicação", "Validar a matriz de comunicação entre aplicação e banco antes do teste integrado.", "REVIEW", "URGENT", [3, 1]], ["Executar teste de restauração do backup", "Restaurar homologação e medir o tempo de recuperação. Meta fictícia: 45 minutos, sem perda de registros do cenário.", "TODO", "HIGH", [2]], ["Atualizar roteiro de operação assistida", "Documentar responsáveis, escalonamento e verificações diárias dos primeiros cinco dias.", "TODO", "LOW", [0, 6]]],
  [["Entregar autenticação do novo portal", "Implementar os fluxos de entrada, recuperação de acesso e renovação de sessão com telemetria.", "IN_PROGRESS", "HIGH", [5, 3]], ["Validar protótipo da jornada de solicitações", "Conduzir teste de usabilidade com perfis fictícios e consolidar os principais pontos de fricção.", "REVIEW", "MEDIUM", [4, 0]], ["Construir biblioteca de componentes do portal", "Publicar componentes responsivos, estados de erro e documentação de uso para o time de desenvolvimento.", "TODO", "HIGH", [4, 5]], ["Automatizar testes do fluxo de aprovação", "Cobrir criação, aprovação e devolução para ajustes, evitando notificações duplicadas.", "TODO", "MEDIUM", [2, 5]], ["Revisar conteúdo e acessibilidade", "Padronizar textos, foco de teclado, contraste e mensagens de cinco serviços prioritários.", "DONE", "LOW", [4, 2]]],
  [["Mapear jornada de atendimento ao cliente", "Consolidar os pontos de contato, tempos de espera e principais motivos de reabertura.", "DONE", "MEDIUM", [6, 4]], ["Revisar indicadores do suporte", "Definir métricas de resolução, satisfação e capacidade por faixa de horário.", "DONE", "MEDIUM", [6, 0]], ["Criar painel executivo de operações", "Montar uma visão semanal com volume, gargalos e alertas para as áreas responsáveis.", "IN_PROGRESS", "HIGH", [5, 6]], ["Treinar equipe no novo processo", "Preparar roteiro prático, material de apoio e simulação de atendimento para a equipe piloto.", "REVIEW", "MEDIUM", [6, 2]], ["Planejar expansão para novas unidades", "Estimar esforço, responsáveis e sequência de implantação para três unidades fictícias.", "TODO", "LOW", [0, 6]]],
] as const;
export function seedIssues(companyId: string, projects: IssueProject[]): IssueState {
  const users = mockIssueUsers(companyId);
  const issues = projects.filter((p) => p.companyId === companyId).flatMap((p, pi) => scenarios[pi % 3].map(([title, description, status, priority, owners], i): Issue => {
    const assignees = owners.map((owner) => users[owner]);
    const area = pi === 0 ? ["Tecnologia da Informação", "Infraestrutura", "TI - Infraestrutura"] : pi === 1 ? ["Produto Digital", "Desenvolvimento e UI/UX", "Produto - Portal"] : ["Operações", "Experiência do cliente", "Operações - Atendimento"];
    return { id: `${p.id}:issue-${i}`, companyId, projectId: p.id, code: pi * 5 + i + 1, title, description, status, priority, issueType: i === 2 ? "PROJECT" : i === 4 ? "IMPROVEMENT" : "TASK", createdByName: users[0].name, createdAt: `2026-08-${String(20 + i).padStart(2, "0")}T09:00:00.000Z`, updatedAt: "2026-09-08T14:00:00.000Z", department: area[0], requester: users[(pi + i) % users.length].name, category: area[1], costCenter: area[2], labels: pi === 0 ? ["infra", "homologação"] : pi === 1 ? ["produto", i % 2 ? "ui-ux" : "desenvolvimento"] : ["operações", "experiência"], components: pi === 0 ? "Plataforma e segurança" : pi === 1 ? "Portal web" : "Atendimento e indicadores", assigneeIds: assignees.map((owner) => owner.id), assigneeId: assignees[0]?.id ?? null, assignee: assignees.map((owner) => owner.name).join(", "), parentId: i === 1 || i === 2 ? `${p.id}:issue-0` : null, blockedByIds: i === 3 ? [`${p.id}:issue-2`] : [], dependsOnIds: i === 4 ? [`${p.id}:issue-3`] : [], startDate: `2026-09-${String(1 + pi * 3 + i).padStart(2, "0")}`, dueDate: `2026-09-${String(12 + pi * 4 + i).padStart(2, "0")}` };
  }));
  return { version: 3, companyId, nextCode: issues.length + 1, issues, users, columns: defaultColumns(), templates: defaultIssueTemplates(companyId) };
}
export function getIssueDraft(issue: Issue, state: IssueState): IssueDraft {
  return { ...issue, blocksIds: state.issues.filter((i) => i.blockedByIds?.includes(issue.id)).map((i) => i.id), dependencyOfIds: state.issues.filter((i) => i.dependsOnIds?.includes(issue.id)).map((i) => i.id) };
}
export function validateIssue(draft: IssueDraft, projects: IssueProject[], companyId: string, columns = defaultColumns()) {
  validateIssueDescription(draft.description);
  if (draft.issueType !== undefined && !Object.hasOwn(ISSUE_TYPES, draft.issueType)) throw new Error("Tipo de demanda inválido.");
  for (const value of [draft.department, draft.requester, draft.category, draft.costCenter, draft.components, draft.createdByName]) if (value !== undefined && (typeof value !== "string" || value.length > 500)) throw new Error("Campo de detalhes inválido.");
  for (const value of [draft.createdAt, draft.updatedAt]) if (value !== undefined && (typeof value !== "string" || Number.isNaN(Date.parse(value)))) throw new Error("Data de registro inválida.");
  if (draft.labels && (!Array.isArray(draft.labels) || draft.labels.length > 20 || draft.labels.some((l) => typeof l !== "string" || l.length > 50))) throw new Error("Use até 20 etiquetas, com até 50 caracteres cada.");
  if (draft.assigneeIds && (!Array.isArray(draft.assigneeIds) || draft.assigneeIds.length > 20 || draft.assigneeIds.some((id) => typeof id !== "string"))) throw new Error("Seleção de responsáveis inválida.");
  if (!draft.title.trim()) throw new Error("Informe o título da demanda.");
  if (!projects.some((p) => p.id === draft.projectId && p.companyId === companyId)) throw new Error("Projeto indisponível para esta empresa.");
  if (!columns.some((c) => c.id === draft.status) || !Object.hasOwn(ISSUE_PRIORITIES, draft.priority)) throw new Error("Status ou prioridade inválidos.");
  for (const date of [draft.startDate, draft.dueDate]) if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) throw new Error("Informe uma data válida.");
  if (draft.startDate && draft.dueDate && draft.dueDate < draft.startDate) throw new Error("O prazo deve ser igual ou posterior ao início.");
}
export function validateGraph(issues: Issue[]) {
  const map = new Map(issues.map((i) => [i.id, i]));
  for (const issue of issues) {
    if (issue.parentId && (!map.has(issue.parentId) || map.get(issue.parentId)!.projectId !== issue.projectId)) throw new Error("A demanda principal deve pertencer ao mesmo projeto.");
    for (const ids of [issue.blockedByIds ?? [], issue.dependsOnIds ?? []]) if (!Array.isArray(ids) || ids.some((id) => !map.has(id))) throw new Error("Vínculo indisponível para esta empresa.");
  }
  function check(next: (issue: Issue) => string[], message: string) {
    const visiting = new Set<string>(), done = new Set<string>();
    function visit(id: string) { if (visiting.has(id)) throw new Error(message); if (done.has(id)) return; visiting.add(id); next(map.get(id)!).forEach(visit); visiting.delete(id); done.add(id); }
    issues.forEach((i) => visit(i.id));
  }
  check((i) => i.parentId ? [i.parentId] : [], "Uma subtarefa não pode criar um ciclo de hierarquia.");
  check((i) => [...(i.blockedByIds ?? []), ...(i.dependsOnIds ?? [])], "Este vínculo cria uma dependência circular.");
}
export function saveIssue(state: IssueState, draft: IssueDraft, projects: IssueProject[], id: string): IssueState {
  validateIssue(draft, projects, state.companyId, state.columns);
  const existing = state.issues.find((i) => i.id === id);
  const { blocksIds, dependencyOfIds, ...fields } = draft;
  for (const links of [blocksIds, dependencyOfIds]) if (links && (!Array.isArray(links) || links.some((target) => target === id || !state.issues.some((i) => i.id === target)))) throw new Error("Vínculo inválido.");
  const assigneeIds = [...new Set(draft.assigneeIds ?? (draft.assigneeId ? [draft.assigneeId] : []))];
  const assignees = assigneeIds.map((assigneeId) => state.users.find((u) => u.id === assigneeId && u.companyId === state.companyId));
  if (assignees.some((assignee) => !assignee)) throw new Error("Responsável indisponível para esta empresa.");
  const names = assignees.flatMap((assignee) => assignee ? [assignee.name] : []);
  const issue: Issue = { ...fields, assigneeIds, assigneeId: assigneeIds[0] ?? null, issueType: draft.issueType ?? "TASK", createdByName: existing?.createdByName ?? draft.createdByName ?? "Usuário de demonstração", createdAt: existing?.createdAt ?? draft.createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString(), title: draft.title.trim(), description: draft.description.trim(), assignee: names.join(", "), id, companyId: state.companyId, code: existing?.code ?? state.nextCode };
  const list = existing ? state.issues.map((i) => i.id === id ? issue : i) : [...state.issues, issue];
  const issues = list.map((i) => i.id === id ? i : { ...i, blockedByIds: blocksIds ? [...(i.blockedByIds ?? []).filter((x) => x !== id), ...(blocksIds.includes(i.id) ? [id] : [])] : i.blockedByIds, dependsOnIds: dependencyOfIds ? [...(i.dependsOnIds ?? []).filter((x) => x !== id), ...(dependencyOfIds.includes(i.id) ? [id] : [])] : i.dependsOnIds });
  validateGraph(issues);
  return { ...state, nextCode: existing ? state.nextCode : state.nextCode + 1, issues };
}
export function removeIssue(state: IssueState, id: string): IssueState {
  return { ...state, issues: state.issues.filter((i) => i.id !== id).map((i) => ({ ...i, parentId: i.parentId === id ? null : i.parentId, blockedByIds: i.blockedByIds?.filter((x) => x !== id), dependsOnIds: i.dependsOnIds?.filter((x) => x !== id) })) };
}
export function saveColumn(state: IssueState, column: IssueColumn): IssueState {
  if (!column.id || !column.name.trim() || column.name.trim().length > 50) throw new Error("Informe um nome de coluna com até 50 caracteres.");
  if (state.columns.some((c) => c.id !== column.id && c.name.toLocaleLowerCase() === column.name.trim().toLocaleLowerCase())) throw new Error("Já existe uma coluna com esse nome.");
  if (!Object.hasOwn(ISSUE_STATUSES, column.category) || !Number.isFinite(column.width)) throw new Error("Configuração de coluna inválida.");
  const value = { ...column, name: column.name.trim(), width: Math.max(240, Math.min(800, Math.round(column.width))) };
  return { ...state, columns: state.columns.some((c) => c.id === column.id) ? state.columns.map((c) => c.id === column.id ? value : c) : [...state.columns, value] };
}
export function restoreIssues(raw: string | null, companyId: string, projects: IssueProject[]): IssueState {
  const fallback = () => seedIssues(companyId, projects);
  if (!raw) return fallback();
  try {
    const data = JSON.parse(raw);
    if (![1, 2, 3].includes(data.version) || data.companyId !== companyId || !Array.isArray(data.issues) || !Number.isSafeInteger(data.nextCode) || data.nextCode < 1) return fallback();
    const state: IssueState = { ...data, version: 3, columns: data.version === 1 ? defaultColumns() : data.columns, users: mockIssueUsers(companyId) };
    if (!Array.isArray(state.columns) || !state.columns.length) return fallback();
    let checked = { ...state, columns: [] as IssueColumn[] };
    for (const column of state.columns) { if (checked.columns.some((c) => c.id === column.id)) return fallback(); checked = saveColumn(checked, column); }
    state.columns = checked.columns;
    const ids = new Set<string>(), codes = new Set<number>();
    for (const issue of state.issues) {
      if (issue.companyId !== companyId || typeof issue.id !== "string" || !issue.id || ids.has(issue.id) || !Number.isSafeInteger(issue.code) || issue.code < 1 || codes.has(issue.code) || issue.code >= state.nextCode) return fallback();
      if (![issue.title, issue.description, issue.assignee, issue.startDate, issue.dueDate].every((v) => typeof v === "string")) return fallback();
      issue.assigneeIds = [...new Set(issue.assigneeIds ?? (issue.assigneeId ? [issue.assigneeId] : []))];
      if (issue.assigneeIds.some((id) => !state.users.some((u) => u.id === id))) return fallback();
      issue.assigneeId = issue.assigneeIds[0] ?? null;
      issue.assignee = issue.assigneeIds.map((id) => state.users.find((u) => u.id === id)!.name).join(", ");
      validateIssue(issue, projects, companyId, state.columns); ids.add(issue.id); codes.add(issue.code);
    }
    state.templates = data.templates ?? defaultIssueTemplates(companyId);
    if (!Array.isArray(state.templates) || state.templates.length > 100) return fallback();
    state.templates.forEach((t) => validateTemplate(t, companyId));
    validateGraph(state.issues); return state;
  } catch { return fallback(); }
}
export function issueActivities(issues: Issue[], projectId: string, columns = defaultColumns()): ProjectActivity[] {
  const progress = (issue: Issue) => ({ TODO: 0, IN_PROGRESS: 50, REVIEW: 90, DONE: 100 })[columns.find((c) => c.id === issue.status)?.category ?? "TODO"];
  const nodes = new Map<string, ProjectActivity>();
  issues.filter((i) => i.projectId === projectId).forEach((issue, i) => {
    const predecessors = [...new Set([...(issue.blockedByIds ?? []), ...(issue.dependsOnIds ?? [])])].map((id) => issues.find((x) => x.id === id)).filter((x): x is Issue => !!x);
    const predecessorsComplete = predecessors.every((p) => progress(p) === 100), progressPercent = progress(issue);
    nodes.set(issue.id, { id: issue.id, projectId, parentId: issue.parentId ?? null, wbsCode: String(i + 1), name: issue.title, kind: "TASK", level: 1, sortOrder: i, durationDays: null, durationHours: null, startDate: issue.startDate || null, endDate: issue.dueDate || null, actualDurationDays: null, actualDurationHours: null, progressPercent, activityStatus: progressPercent === 100 ? "COMPLETED" : progressPercent ? "IN_PROGRESS" : "NOT_STARTED", completedAt: null, assigneeUserId: issue.assigneeIds?.[0] ?? issue.assigneeId ?? null, assigneeName: issue.assignee || null, assigneeDisplayName: issue.assignee || null, isMilestone: false, notes: issue.description, predecessorIds: predecessors.map((p) => p.id), predecessors: predecessors.map((p) => ({ id: p.id, name: p.title, wbsCode: `DEM-${p.code}`, completed: progress(p) === 100 })), predecessorsComplete, canStart: predecessorsComplete, appointments: [], children: [] });
  });
  const roots: ProjectActivity[] = [];
  nodes.forEach((node) => { const parent = node.parentId ? nodes.get(node.parentId) : null; if (parent) parent.children.push(node); else roots.push(node); });
  function number(list: ProjectActivity[], prefix = "", level = 1) { list.forEach((node, i) => { node.wbsCode = `${prefix}${i + 1}`; node.level = level; number(node.children, `${node.wbsCode}.`, level + 1); }); }
  number(roots); return roots;
}
