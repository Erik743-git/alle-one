"use client";

import { validateTemplate, type IssueTemplate } from "@/lib/issue-templates";
import { applyIssueImport, type IssueTable } from "@/lib/issue-transfer";
import { useAuth } from "@/lib/use-auth";
import { useEffect, useState } from "react";
import { removeIssue, restoreIssues, saveIssue, saveColumn, type IssueColumn, type IssueDraft, type IssueProject, type IssueState } from "@/lib/project-issues";

/** Local demo only. No real project endpoints are called. */
export function useProjectIssues(companyId: string, projects: IssueProject[]) {
  const { user } = useAuth();
  const key = `alleone.demo.project-issues.complete.v3:${encodeURIComponent(companyId)}`;
  const legacyKey = `alleone.demo.project-issues.v1:${encodeURIComponent(companyId)}`;
  const [state, setState] = useState(() => {
    try { return restoreIssues(window.localStorage.getItem(key), companyId, projects); }
    catch { return restoreIssues(null, companyId, projects); }
  });
  useEffect(() => {
    window.localStorage.removeItem(legacyKey);
    function sync(event: StorageEvent) {
      if (event.key === key || event.key === null) setState(restoreIssues(event.newValue, companyId, projects));
    }
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [key, legacyKey, companyId, projects]);

  function commit(update: (current: IssueState) => IssueState) {
    // Re-read the shared company store to avoid overwriting another tab's edits.
    let next: IssueState;
    try {
      const raw = window.localStorage.getItem(key);
      next = update(raw === null ? state : restoreIssues(raw, companyId, projects));
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch (err) {
      if (err instanceof DOMException) throw new Error("Não foi possível salvar neste navegador. Verifique o armazenamento disponível e tente novamente.");
      throw err;
    }
    setState(next);
  }
  return {
    state,
    save(draft: IssueDraft, id?: string) {
      commit((current) => {
        if (id && !current.issues.some((issue) => issue.id === id)) throw new Error("Esta demanda foi excluída em outra aba. Atualize a página.");
        return saveIssue(current, { ...draft, createdByName: id ? draft.createdByName : user?.name ?? "Usuário de demonstração" }, projects, id ?? window.crypto.randomUUID());
      });
    },
    importData(table: IssueTable) { commit((current) => applyIssueImport(current, projects, table, () => crypto.randomUUID())); },
    saveTemplate(template: IssueTemplate) { commit((current) => { validateTemplate(template, companyId); const templates = current.templates ?? []; if (templates.length >= 100 && !templates.some((t) => t.id === template.id)) throw new Error("Limite de 100 modelos atingido."); return { ...current, templates: templates.some((t) => t.id === template.id) ? templates.map((t) => t.id === template.id ? template : t) : [...templates, template] }; }); },
    deleteTemplate(id: string) { commit((current) => ({ ...current, templates: current.templates?.filter((t) => t.id !== id) })); },
    importModels(templates: IssueTemplate[]) { commit((current) => { templates.forEach((t) => validateTemplate(t, companyId)); if ((current.templates?.length ?? 0) + templates.length > 100) throw new Error("Limite de 100 modelos atingido."); return { ...current, templates: [...(current.templates ?? []), ...templates] }; }); },
    saveColumn(column: IssueColumn) { commit((current) => saveColumn(current, column)); },
    remove(id: string) { commit((current) => removeIssue(current, id)); },
  };
}
