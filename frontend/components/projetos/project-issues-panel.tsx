"use client";

import { useRef, useState, type FormEvent } from "react";
import { Columns3, LayoutGrid, List, Plus, Search, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { notifyError } from "@/lib/notify";
import { useAuth } from "@/lib/use-auth";
import { ISSUE_TYPES, type IssueTemplate } from "@/lib/issue-templates";
import { issueDescriptionText } from "@/lib/issue-description";
import type { IssueTable } from "@/lib/issue-transfer";
import { IssueDescriptionEditor, type IssueDescriptionHandle } from "@/components/projetos/issue-description-editor";
import { IssueDataTools } from "@/components/projetos/issue-data-tools";
import { IssueTemplateManager } from "@/components/projetos/issue-template-manager";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ISSUE_PRIORITIES, ISSUE_STATUSES, getIssueDraft, type IssueColumn, type Issue, type IssueDraft, type IssueProject, type IssueState, type IssueStatus } from "@/lib/project-issues";

import { IssueAssignee, IssueFace, IssueLinksFields, ResizableIssueColumn } from "@/components/projetos/issue-controls";

const selectStyle = "h-9 w-full rounded-md border bg-background px-3 text-sm";
const statusStyle = { TODO: "bg-slate-500/10 text-slate-600 dark:text-slate-300", IN_PROGRESS: "bg-blue-500/10 text-blue-600 dark:text-blue-300", REVIEW: "bg-amber-500/10 text-amber-700 dark:text-amber-300", DONE: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" };
const priorityStyle = { LOW: "text-muted-foreground", MEDIUM: "text-blue-600 dark:text-blue-300", HIGH: "text-orange-600 dark:text-orange-300", URGENT: "text-red-600 dark:text-red-300" };
const dateLabel = (date: string) => date ? date.split("-").reverse().join("/") : "Sem prazo";

type Props = {
  state: IssueState; projects: IssueProject[]; initialProjectId?: string;
  onSave: (draft: IssueDraft, id?: string) => void;
  onDelete: (id: string) => void;
  onColumnSave: (column: IssueColumn) => void;
  onImport: (table: IssueTable) => void;
  onSaveTemplate: (template: IssueTemplate) => void;
  onDeleteTemplate: (id: string) => void;
  onImportTemplates: (templates: IssueTemplate[]) => void;
};

export function ProjectIssuesPanel({ state, projects, initialProjectId, onSave, onDelete, onColumnSave, onImport, onSaveTemplate, onDeleteTemplate, onImportTemplates }: Props) {
  const { user } = useAuth();
  const descriptionEditor = useRef<IssueDescriptionHandle>(null);
  const [editorRevision, setEditorRevision] = useState(0), [saving, setSaving] = useState(false), [selectedTemplate, setSelectedTemplate] = useState(""), [templateApply, setTemplateApply] = useState<IssueTemplate | null>(null);
  const [columnEditor, setColumnEditor] = useState<IssueColumn | null>(null);
  const statusOptions = state.columns.map((c) => [c.id, c.name]);
  const statusLabel = (id: string) => state.columns.find((c) => c.id === id)?.name ?? id;
  const statusClass = (id: string) => statusStyle[state.columns.find((c) => c.id === id)?.category ?? "TODO"];
  const [view, setView] = useState<"kanban" | "list" | "cards">("kanban");
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState(initialProjectId ?? "all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [editor, setEditor] = useState<{ issue?: Issue; draft: IssueDraft } | null>(null);
  const [deleting, setDeleting] = useState<Issue | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<IssueStatus | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? "Projeto";
  const query = search.trim().toLocaleLowerCase("pt-BR");
  const filtered = state.issues.filter((issue) => (projectFilter === "all" || issue.projectId === projectFilter)
    && (statusFilter === "all" || issue.status === statusFilter)
    && (priorityFilter === "all" || issue.priority === priorityFilter)
    && (!query || `${issue.title} DEM-${issue.code} ${issueDescriptionText(issue.description)} ${issue.assignee} ${projectName(issue.projectId)}`.toLocaleLowerCase("pt-BR").includes(query)));

  function openEditor(issue?: Issue, status: IssueStatus = state.columns[0].id, parentId: string | null = null) {
    setError("");
    setEditorRevision((n) => n + 1); setSelectedTemplate(""); setTemplateApply(null);
    setEditor({ issue, draft: issue ? getIssueDraft(issue, state) : { issueType: "TASK", createdByName: user?.name ?? "Usuário de demonstração", parentId, blockedByIds: [], dependsOnIds: [], blocksIds: [], dependencyOfIds: [], assigneeId: null, assigneeIds: [], projectId: parentId ? state.issues.find((i) => i.id === parentId)!.projectId : projectFilter === "all" ? projects[0]?.id ?? "" : projectFilter, title: "", description: "", status, priority: "MEDIUM", assignee: "", startDate: "", dueDate: "" } });
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!editor) return;
    setSaving(true);
    try { const description = await descriptionEditor.current!.read(); onSave({ ...editor.draft, description }, editor.issue?.id); setAnnouncement(editor.issue ? "Demanda atualizada." : "Demanda criada."); setEditor(null); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível salvar."); } finally { setSaving(false); }
  }
  function move(id: string, status: IssueStatus) {
    const issue = state.issues.find((item) => item.id === id);
    if (!issue || issue.status === status) return;
    try { onSave({ ...getIssueDraft(issue, state), status }, id); setAnnouncement(`DEM-${issue.code} movida para ${statusLabel(status)}.`); }
    catch (err) { notifyError(err instanceof Error ? err.message : "Não foi possível mover."); }
  }
  function assigneeControl(issue: Issue) {
    return <IssueAssignee issue={issue} users={state.users} onAssign={(assigneeIds) => {
      try { onSave({ ...getIssueDraft(issue, state), assigneeIds }, issue.id); setAnnouncement("Responsáveis atualizados."); }
      catch (err) { notifyError(err instanceof Error ? err.message : "Não foi possível atribuir."); }
    }} />;
  }
  function relationSummary(issue: Issue) {
    const links = getIssueDraft(issue, state);
    const entries = [
      ["Subtarefa de", issue.parentId ? [issue.parentId] : []],
      ["É bloqueada por", links.blockedByIds ?? []], ["Bloqueia", links.blocksIds ?? []],
      ["Depende de", links.dependsOnIds ?? []], ["É dependência de", links.dependencyOfIds ?? []],
    ] as const;
    return <div className="space-y-1 text-xs text-muted-foreground">{entries.filter(([, ids]) => ids.length).map(([label, ids]) => <p key={label}>{label}: {ids.map((id) => { const related = state.issues.find((i) => i.id === id); return related ? <button key={id} onClick={() => openEditor(related)} className="mr-1 rounded bg-muted px-1.5 py-0.5 text-primary" title={related.title}>DEM-{related.code}</button> : null; })}</p>)}</div>;
  }
  function issueCard(issue: Issue, draggable = false) {
    return <article key={issue.id} draggable={draggable} onDragStart={(event) => { event.dataTransfer.setData("text/plain", issue.id); event.dataTransfer.effectAllowed = "move"; setDragging(issue.id); }} onDragEnd={() => { setDragging(null); setOver(null); }}
      className={`space-y-2 rounded-xl border bg-card p-3 shadow-sm transition hover:border-primary/40 ${draggable ? "cursor-grab active:cursor-grabbing" : ""} ${dragging === issue.id ? "opacity-50" : ""}`}>
      <div className="flex items-center justify-between gap-2"><span className="font-mono text-xs text-muted-foreground">DEM-{issue.code}</span><span className={`text-xs font-medium ${priorityStyle[issue.priority]}`}>{ISSUE_PRIORITIES[issue.priority]}</span></div>
      <button type="button" onClick={() => openEditor(issue)} className="block w-full line-clamp-2 break-words text-left text-sm font-semibold hover:text-primary">{issue.title}</button>
      <p className="truncate text-xs text-muted-foreground">{ISSUE_TYPES[issue.issueType ?? "TASK"]} · {projectName(issue.projectId)}</p>

      <span className={`inline-block rounded-full px-2 py-1 text-xs ${statusClass(issue.status)}`}>{statusLabel(issue.status)}</span>
      {view === "kanban" ? relationSummary(issue) : <p className="text-xs text-muted-foreground">{issue.parentId ? "Subtarefa · " : ""}{(issue.blockedByIds?.length ?? 0) + (issue.dependsOnIds?.length ?? 0)} dependências</p>}
      <div className="flex items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground"><span>{dateLabel(issue.dueDate)}</span>{assigneeControl(issue)}</div>
      <div className="flex justify-end gap-1">
        <div className="flex"><Button variant="ghost" size="icon" aria-label={`Editar DEM-${issue.code}`} onClick={() => openEditor(issue)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label={`Excluir DEM-${issue.code}`} onClick={() => { setError(""); setDeleting(issue); }}><Trash2 className="h-4 w-4" /></Button></div>
      </div>
    </article>;
  }

  return <section className="space-y-5" aria-label="Demandas dos projetos">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">Demandas</h2><p className="mt-1 text-sm text-muted-foreground">Organize o trabalho dos projetos e acompanhe cada entrega.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => { setError(""); setColumnEditor({ id: `column-${crypto.randomUUID()}`, name: "", width: 304, category: "IN_PROGRESS" }); }}>Nova coluna</Button><Button disabled={!projects.length} onClick={() => openEditor()}><Plus className="mr-2 h-4 w-4" />Nova demanda</Button></div></div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="inline-flex gap-1 rounded-lg border bg-muted/40 p-1" aria-label="Visualização de demandas">{([{ id: "kanban", label: "Kanban", icon: Columns3 }, { id: "list", label: "Lista", icon: List }, { id: "cards", label: "Cartões", icon: LayoutGrid }] as const).map(({ id, label, icon: Icon }) => <Button key={id} size="sm" variant={view === id ? "default" : "ghost"} aria-pressed={view === id} onClick={() => setView(id)}><Icon className="mr-1.5 h-4 w-4" />{label}</Button>)}</div>
      <span className="text-sm text-muted-foreground">{filtered.length} de {state.issues.length} demandas</span>
    </div>
    <div className="flex flex-wrap items-start gap-2"><IssueDataTools state={state} projects={projects} onImport={onImport} /><IssueTemplateManager companyId={state.companyId} templates={state.templates ?? []} onSave={onSaveTemplate} onDelete={onDeleteTemplate} onImport={onImportTemplates} /></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Buscar demandas" placeholder="Buscar título, código ou responsável" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      <select className={selectStyle} aria-label="Filtrar projeto" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}><option value="all">Todos os projetos</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <select className={selectStyle} aria-label="Filtrar status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">Todos os status</option>{statusOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      <select className={selectStyle} aria-label="Filtrar prioridade" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}><option value="all">Todas as prioridades</option>{Object.entries(ISSUE_PRIORITIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
    </div>
    <p role="status" className="sr-only">{announcement}</p>
    {!filtered.length && <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground"><p>{state.issues.length ? "Nenhuma demanda corresponde aos filtros." : "Nenhuma demanda cadastrada. Crie a primeira para começar."}</p>{state.issues.length > 0 && <Button variant="link" onClick={() => { setSearch(""); setProjectFilter("all"); setStatusFilter("all"); setPriorityFilter("all"); }}>Limpar filtros</Button>}</div>}
    {view === "kanban" ? <>

      <div className="overflow-x-auto pb-3"><div className="flex w-max items-start gap-4 pr-3">{state.columns.map((column) => {
        const key = column.id, label = column.name;
        const status = key as IssueStatus;
        const issues = filtered.filter((issue) => issue.status === status);
        return <ResizableIssueColumn column={column} onResize={(width) => { try { onColumnSave({ ...column, width }); } catch (err) { notifyError(err instanceof Error ? err.message : "Falha ao redimensionar."); } }} key={status} aria-label={`Coluna ${label}`} onDragOver={(e) => { if (e.dataTransfer.types.includes("text/plain")) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOver(status); } }} onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain"); if (id) move(id, status); setDragging(null); setOver(null); }} className={`relative shrink-0 min-h-72 space-y-3 rounded-xl border bg-muted/30 p-3 ${over === status ? "ring-2 ring-primary" : ""}`}>
          <div className="flex items-center justify-between gap-2"><h3 className="min-w-0 break-words text-sm font-semibold"><button className="text-left hover:text-primary" aria-label={`Configurar coluna ${label}`} onClick={() => { setError(""); setColumnEditor({ ...column }); }}>{label}</button> <span className="ml-1 text-muted-foreground">{issues.length}</span></h3><Button size="icon" variant="ghost" aria-label={`Nova demanda em ${label}`} onClick={() => openEditor(undefined, status)}><Plus className="h-4 w-4" /></Button></div>
          {issues.map((issue) => issueCard(issue, true))}
          {!issues.length && <p className="rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground">Nenhuma demanda nesta etapa</p>}
        </ResizableIssueColumn>;
      })}</div></div>
    </> : view === "cards" ? <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{filtered.map((issue) => issueCard(issue))}</div> : filtered.length > 0 ? <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-muted/50"><tr>{["Demanda", "Projeto", "Status", "Prioridade", "Responsáveis", "Prazo", "Ações"].map((label) => <th scope="col" key={label} className="p-3 font-medium">{label}</th>)}</tr></thead><tbody>{filtered.map((issue) => <tr key={issue.id} className="border-t hover:bg-muted/20">
      <td className="max-w-xs p-3"><button className="text-left hover:text-primary" onClick={() => openEditor(issue)}><span className="block font-mono text-xs text-muted-foreground">DEM-{issue.code}</span><span className="break-words font-medium">{issue.title}</span></button></td>
      <td className="max-w-44 p-3">{projectName(issue.projectId)}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-xs ${statusClass(issue.status)}`}>{statusLabel(issue.status)}</span></td>
      <td className={`p-3 ${priorityStyle[issue.priority]}`}>{ISSUE_PRIORITIES[issue.priority]}</td><td className="p-3">{assigneeControl(issue)}</td><td className="whitespace-nowrap p-3">{dateLabel(issue.dueDate)}</td><td className="p-3"><div className="flex"><Button size="icon" variant="ghost" aria-label={`Editar DEM-${issue.code}`} onClick={() => openEditor(issue)}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" aria-label={`Excluir DEM-${issue.code}`} onClick={() => { setError(""); setDeleting(issue); }}><Trash2 className="h-4 w-4" /></Button></div></td>
    </tr>)}</tbody></table></div> : null}

    <Dialog open={!!editor} onOpenChange={(open) => { if (!open && !saving) setEditor(null); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl"><DialogHeader><DialogTitle>{editor?.issue ? `Editar DEM-${editor.issue.code}` : "Nova demanda"}</DialogTitle><DialogDescription>As alterações aparecem em todas as visualizações e no cronograma do projeto.</DialogDescription></DialogHeader>
      {editor && <form onSubmit={submit} className="space-y-4">
        <label className="block space-y-1 text-sm font-medium">Título<Input autoFocus required maxLength={160} value={editor.draft.title} onChange={(e) => setEditor({ ...editor, draft: { ...editor.draft, title: e.target.value } })} /></label>
        <label className="block space-y-1 text-sm font-medium">Projeto<select required className={selectStyle} value={editor.draft.projectId} onChange={(e) => setEditor({ ...editor, draft: { ...editor.draft, projectId: e.target.value } })}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3"><select aria-label="Modelo da demanda" className={`${selectStyle} sm:max-w-xs`} value={selectedTemplate} onChange={(e) => setSelectedTemplate(e.target.value)}><option value="">Selecionar modelo</option>{state.templates?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select><Button type="button" variant="outline" disabled={!selectedTemplate || saving} onClick={() => setTemplateApply(state.templates?.find((t) => t.id === selectedTemplate) ?? null)}>Aplicar modelo</Button></div>
        {templateApply && <div className="space-y-2 rounded-lg border p-3"><p className="text-sm">Substituir a descrição e os campos padrão pelo modelo “{templateApply.name}”?</p><Button type="button" size="sm" onClick={() => { setEditor({ ...editor, draft: { ...editor.draft, description: templateApply.description, issueType: templateApply.issueType, priority: templateApply.priority, department: templateApply.department, labels: [...templateApply.labels] } }); setEditorRevision((n) => n + 1); setTemplateApply(null); }}>Confirmar modelo</Button><Button type="button" size="sm" variant="ghost" onClick={() => setTemplateApply(null)}>Cancelar</Button></div>}
        <IssueDescriptionEditor key={editorRevision} ref={descriptionEditor} initialValue={editor.draft.description} disabled={saving} />
        <div className="grid gap-3 sm:grid-cols-3"><label className="text-sm">Tipo da demanda<select aria-label="Tipo da demanda" className={selectStyle} value={editor.draft.issueType ?? "TASK"} onChange={(e) => setEditor({ ...editor, draft: { ...editor.draft, issueType: e.target.value as Issue["issueType"] } })}>{Object.entries(ISSUE_TYPES).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><label className="text-sm">Criado por<Input readOnly value={editor.issue?.createdByName ?? editor.draft.createdByName ?? "Não informado"} /></label><label className="text-sm">Criado em<Input readOnly value={editor.issue?.createdAt ? new Date(editor.issue.createdAt).toLocaleString("pt-BR") : "Ao salvar"} /></label></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{([["department", "Departamento"], ["requester", "Solicitante"], ["category", "Categoria"], ["costCenter", "Centro de custo"], ["components", "Componentes"]] as const).map(([field, label]) => <label key={field} className="text-sm">{label}<Input maxLength={500} value={editor.draft[field] ?? ""} onChange={(e) => setEditor({ ...editor, draft: { ...editor.draft, [field]: e.target.value } })} /></label>)}<label className="text-sm">Etiquetas<Input placeholder="Separe por vírgulas" value={(editor.draft.labels ?? []).join(",")} onChange={(e) => setEditor({ ...editor, draft: { ...editor.draft, labels: e.target.value.split(",") } })} /></label></div>
        <Link href={`/projetos/${encodeURIComponent(state.companyId)}/${encodeURIComponent(editor.draft.projectId)}`} className="inline-flex text-sm text-primary">Abrir projeto vinculado</Link>
        <div className="grid gap-4 sm:grid-cols-2"><label className="block space-y-1 text-sm font-medium">Status<select className={selectStyle} value={editor.draft.status} onChange={(e) => setEditor({ ...editor, draft: { ...editor.draft, status: e.target.value as IssueStatus } })}>{statusOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="block space-y-1 text-sm font-medium">Prioridade<select className={selectStyle} value={editor.draft.priority} onChange={(e) => setEditor({ ...editor, draft: { ...editor.draft, priority: e.target.value as Issue["priority"] } })}>{Object.entries(ISSUE_PRIORITIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
        <fieldset className="space-y-2 rounded-xl border p-4"><legend className="px-1 text-sm font-semibold">Responsáveis</legend><p className="text-xs text-muted-foreground">Selecione todas as pessoas que participarão desta demanda.</p><div className="grid gap-2 sm:grid-cols-2">{state.users.map((u) => { const selected = (editor.draft.assigneeIds ?? (editor.draft.assigneeId ? [editor.draft.assigneeId] : [])).includes(u.id); return <label key={u.id} className="flex cursor-pointer items-center gap-3 rounded-lg border p-2 text-sm"><input type="checkbox" checked={selected} onChange={(e) => { const current = editor.draft.assigneeIds ?? (editor.draft.assigneeId ? [editor.draft.assigneeId] : []); setEditor({ ...editor, draft: { ...editor.draft, assigneeIds: e.target.checked ? [...current, u.id] : current.filter((id) => id !== u.id) } }); }} /><IssueFace user={u} /><span><span className="block font-medium">{u.name}</span><span className="text-xs text-muted-foreground">{u.role}</span></span></label>; })}</div></fieldset>
        <IssueLinksFields draft={editor.draft} issueId={editor.issue?.id} state={state} onChange={(draft) => setEditor({ ...editor, draft })} />
        {editor.issue && <div className="space-y-2"><p className="text-sm font-medium">Subtarefas</p>{state.issues.filter((i) => i.parentId === editor.issue!.id).map((i) => <button type="button" key={i.id} className="block text-left text-sm text-primary" onClick={() => openEditor(i)}>DEM-{i.code} · {i.title}</button>)}<Button type="button" variant="outline" size="sm" onClick={() => openEditor(undefined, state.columns[0].id, editor.issue!.id)}>Criar subtarefa</Button></div>}
        <div className="grid gap-4 sm:grid-cols-2"><label className="block space-y-1 text-sm font-medium">Início<Input type="date" value={editor.draft.startDate} onChange={(e) => setEditor({ ...editor, draft: { ...editor.draft, startDate: e.target.value } })} /></label><label className="block space-y-1 text-sm font-medium">Prazo<Input type="date" min={editor.draft.startDate || undefined} value={editor.draft.dueDate} onChange={(e) => setEditor({ ...editor, draft: { ...editor.draft, dueDate: e.target.value } })} /></label></div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setEditor(null)}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar demanda"}</Button></div>
      </form>}
    </DialogContent></Dialog>
    <Dialog open={!!deleting} onOpenChange={(open) => { if (!open) setDeleting(null); }}><DialogContent><DialogHeader><DialogTitle>Excluir demanda?</DialogTitle><DialogDescription>DEM-{deleting?.code}: {deleting?.title}. Ela será removida de todas as visualizações e do cronograma. As subtarefas serão preservadas como demandas principais e os vínculos serão desfeitos.</DialogDescription></DialogHeader>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDeleting(null)}>Cancelar</Button><Button variant="destructive" onClick={() => { if (!deleting) return; try { onDelete(deleting.id); setDeleting(null); setAnnouncement("Demanda excluída."); } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível excluir."); } }}>Excluir demanda</Button></div></DialogContent></Dialog>
    <Dialog open={!!columnEditor} onOpenChange={(open) => { if (!open) setColumnEditor(null); }}><DialogContent><DialogHeader><DialogTitle>{state.columns.some((c) => c.id === columnEditor?.id) ? "Configurar coluna" : "Nova coluna"}</DialogTitle><DialogDescription>Personalize a etapa do quadro e sua largura.</DialogDescription></DialogHeader>{columnEditor && <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); try { onColumnSave(columnEditor); setColumnEditor(null); setAnnouncement("Coluna salva."); } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível salvar."); } finally { setSaving(false); } }}>
      <label className="block space-y-1 text-sm">Nome da coluna<Input autoFocus required maxLength={50} value={columnEditor.name} onChange={(e) => setColumnEditor({ ...columnEditor, name: e.target.value })} /></label>
      <label className="block space-y-1 text-sm">Etapa do cronograma<select className={selectStyle} value={columnEditor.category} onChange={(e) => setColumnEditor({ ...columnEditor, category: e.target.value as IssueColumn["category"] })}>{Object.entries(ISSUE_STATUSES).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label className="block space-y-1 text-sm">Largura da coluna · {columnEditor.width}px<Input type="range" min={240} max={800} step={10} value={columnEditor.width} onChange={(e) => setColumnEditor({ ...columnEditor, width: Number(e.target.value) })} /></label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button type="submit">Salvar coluna</Button>
    </form>}</DialogContent></Dialog>
  </section>;
}
