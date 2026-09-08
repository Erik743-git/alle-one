import { descriptionSections, validateIssueDescription } from "@/lib/issue-description";
export const ISSUE_TYPES = { TASK: "Tarefa", BUG: "Problema / Bug", IMPROVEMENT: "Melhoria", REQUEST: "Solicitação", PROJECT: "Projeto TI" } as const;
export type IssueType = keyof typeof ISSUE_TYPES;
export type IssueTemplate = { id: string; companyId: string; name: string; description: string; issueType: IssueType; priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT"; department: string; labels: string[] };
export function defaultIssueTemplates(companyId: string): IssueTemplate[] {
  return [{ id: "template-problema", companyId, name: "Análise de problema", description: descriptionSections("Descrição/Problema/Impacto/Resultado esperado/Critérios de aceite"), issueType: "BUG", priority: "MEDIUM", department: "Tecnologia da Informação", labels: ["triagem"] }, { id: "template-entrega", companyId, name: "Planejamento de entrega", description: descriptionSections("Descrição/Objetivo/Escopo/Etapas/Critérios de aceite"), issueType: "TASK", priority: "MEDIUM", department: "", labels: [] }];
}
export function validateTemplate(template: IssueTemplate, companyId: string) {
  if (template.companyId !== companyId || !template.id || !template.name?.trim() || template.name.length > 100) throw new Error("Modelo inválido para esta empresa.");
  if (!Object.hasOwn(ISSUE_TYPES, template.issueType) || !["LOW", "MEDIUM", "HIGH", "URGENT"].includes(template.priority)) throw new Error("Tipo ou prioridade inválidos no modelo.");
  if (typeof template.department !== "string" || !Array.isArray(template.labels) || template.labels.some((l) => typeof l !== "string" || l.length > 50)) throw new Error("Campos inválidos no modelo.");
  validateIssueDescription(template.description);
}
export function exportTemplates(templates: IssueTemplate[]) {
  return JSON.stringify({ format: "alleone-demandas-modelos", version: 1, templates: templates.map(({ name, description, issueType, priority, department, labels }) => ({ name, description, issueType, priority, department, labels })) }, null, 2);
}
export function importTemplates(raw: string, companyId: string, id: () => string): IssueTemplate[] {
  if (raw.length > 5000000) throw new Error("O arquivo de modelos deve ter até 5 MB.");
  const data = JSON.parse(raw);
  if (data.format !== "alleone-demandas-modelos" || data.version !== 1 || !Array.isArray(data.templates) || !data.templates.length || data.templates.length > 50) throw new Error("Arquivo de modelos Alleone inválido.");
  return data.templates.map((item: Omit<IssueTemplate, "id" | "companyId">) => { const template = { ...item, id: id(), companyId }; validateTemplate(template, companyId); return template; });
}
