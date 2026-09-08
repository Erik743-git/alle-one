"use client";
import { useRef, useState, type ReactNode } from "react";
import { UserRound, GripVertical } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import type { Issue, IssueColumn, IssueDraft, IssueState, IssueUser } from "@/lib/project-issues";

export function IssueFace({ user }: { user?: IssueUser }) {
  if (!user) return <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted"><UserRound className="h-4 w-4" /></span>;
  return <svg viewBox="0 0 40 40" className="h-8 w-8 shrink-0 rounded-full ring-2 ring-background" aria-hidden="true">
    <rect width="40" height="40" fill={user.color} /><path d="M6 40c0-14 28-14 28 0" fill={["#3c5870", "#42578b", "#705078", "#326052", "#805638"][user.face]} />
    <ellipse cx="20" cy="19" rx="10" ry="12" fill={["#d99872", "#b87551", "#f1bf9d", "#865638", "#e8ae86"][user.face]} />
    <path d={user.face % 2 ? "M10 18Q7 4 20 5Q33 5 30 18L25 11L12 14Z" : "M9 27V14Q9 3 21 5Q34 5 31 29L28 16L15 11L12 28Z"} fill={["#553c31", "#302b2b", "#59402d", "#292724", "#874b2f"][user.face]} />
    <circle cx="16" cy="19" r="1" fill="#352923" /><circle cx="24" cy="19" r="1" fill="#352923" /><path d="M17 25Q20 27 23 25" stroke="#7d4639" strokeWidth="1.2" fill="none" strokeLinecap="round" />
  </svg>;
}

export function IssueAssignee({ issue, users, onAssign }: { issue: Issue; users: IssueUser[]; onAssign: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false), [search, setSearch] = useState("");
  const selectedIds = issue.assigneeIds ?? (issue.assigneeId ? [issue.assigneeId] : []);
  const selected = selectedIds.map((id) => users.find((u) => u.id === id)).filter((user): user is IssueUser => !!user);
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild>
    <button type="button" aria-label={`Atribuir responsáveis DEM-${issue.code}`} title={selected.map((user) => user.name).join(", ") || "Atribuir responsáveis"} className="flex -space-x-2 rounded-full p-0.5 transition hover:ring-2 hover:ring-primary focus-visible:ring-2 focus-visible:ring-primary">
      {selected.length ? selected.slice(0, 3).map((user) => <IssueFace key={user.id} user={user} />) : <IssueFace />}
      {selected.length > 3 && <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-muted text-[11px] font-semibold ring-2 ring-background">+{selected.length - 3}</span>}
    </button>
  </PopoverTrigger><PopoverContent className="w-72 max-w-[calc(100vw-2rem)] space-y-3" align="end">
    <div><p className="text-sm font-semibold">Responsáveis · DEM-{issue.code}</p><p className="text-xs text-muted-foreground">Selecione uma ou mais pessoas.</p></div><Input aria-label="Buscar usuário" placeholder="Buscar usuário fictício" value={search} onChange={(e) => setSearch(e.target.value)} />
    <div className="max-h-64 space-y-1 overflow-y-auto"><button className="w-full rounded-md p-2 text-left text-sm hover:bg-muted" onClick={() => onAssign([])}>Limpar responsáveis</button>
      {users.filter((u) => `${u.name} ${u.role}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map((u) => { const checked = selectedIds.includes(u.id); return <button key={u.id} className="flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-muted" onClick={() => onAssign(checked ? selectedIds.filter((id) => id !== u.id) : [...selectedIds, u.id])}><IssueFace user={u} /><span><span className="block text-sm font-medium">{u.name}</span><span className="text-xs text-muted-foreground">{u.role}</span></span>{checked && <span className="ml-auto text-primary">✓</span>}</button>; })}
      {!users.some((u) => `${u.name} ${u.role}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())) && <p className="p-2 text-sm text-muted-foreground">Nenhum usuário encontrado.</p>}
    </div><p className="text-xs text-muted-foreground">Pessoas fictícias da empresa de demonstração.</p>
  </PopoverContent></Popover>;
}

const relationFields = [["blockedByIds", "É bloqueada por"], ["blocksIds", "Bloqueia"], ["dependsOnIds", "Depende de"], ["dependencyOfIds", "É dependência de"]] as const;
export function IssueLinksFields({ draft, issueId, state, onChange }: { draft: IssueDraft; issueId?: string; state: IssueState; onChange: (draft: IssueDraft) => void }) {
  const candidates = state.issues.filter((i) => i.id !== issueId);
  return <fieldset className="space-y-3 rounded-xl border p-4"><legend className="px-1 text-sm font-semibold">Hierarquia e vínculos</legend>
    <label className="block space-y-1 text-sm">Subtarefa de<select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={draft.parentId ?? ""} onChange={(e) => onChange({ ...draft, parentId: e.target.value || null })}><option value="">Nenhuma · demanda principal</option>{candidates.filter((i) => i.projectId === draft.projectId).map((i) => <option key={i.id} value={i.id}>DEM-{i.code} · {i.title}</option>)}</select></label>
    <div className="grid gap-2 sm:grid-cols-2">{relationFields.map(([field, label]) => <details key={field} className="min-w-0 rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">{label} <span className="text-muted-foreground">({draft[field]?.length ?? 0})</span></summary><div className="mt-2 max-h-44 space-y-2 overflow-y-auto">{candidates.map((i) => <label key={i.id} className="flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5" checked={draft[field]?.includes(i.id) ?? false} onChange={(e) => onChange({ ...draft, [field]: e.target.checked ? [...(draft[field] ?? []), i.id] : draft[field]?.filter((id) => id !== i.id) })} /><span>DEM-{i.code} · {i.title}</span></label>)}{!candidates.length && <p className="text-xs text-muted-foreground">Crie outra demanda para vinculá-la.</p>}</div></details>)}</div>
    <p className="text-xs text-muted-foreground">Os vínculos aparecem nos dois lados. Dependências circulares não são permitidas.</p>
  </fieldset>;
}

export function ResizableIssueColumn({ column, onResize, children, ...props }: { column: IssueColumn; onResize: (width: number) => void; children: ReactNode } & React.HTMLAttributes<HTMLElement>) {
  const [preview, setPreview] = useState<number | null>(null);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const width = preview ?? column.width;
  const clamp = (value: number) => Math.min(800, Math.max(240, Math.round(value)));
  return <section {...props} style={{ ...props.style, width: `min(${width}px, calc(100vw - 48px))` }}>
    {children}
    <div role="separator" tabIndex={0} aria-label={`Redimensionar ${column.name}`} aria-orientation="vertical" aria-valuemin={240} aria-valuemax={800} aria-valuenow={width} title="Arraste para ajustar a largura. Use as setas no teclado."
      className="absolute -right-2 top-0 z-10 flex h-full w-4 touch-none cursor-col-resize items-start justify-center rounded hover:bg-primary/10 focus-visible:bg-primary/20 focus-visible:outline-none"
      onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, width }; }}
      onPointerMove={(e) => { if (drag.current) setPreview(clamp(drag.current.width + e.clientX - drag.current.x)); }}
      onPointerUp={(e) => { if (!drag.current) return; const value = clamp(drag.current.width + e.clientX - drag.current.x); drag.current = null; setPreview(null); onResize(value); }}
      onPointerCancel={() => { drag.current = null; setPreview(null); }}
      onKeyDown={(e) => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) { e.preventDefault(); onResize(e.key === "Home" ? 240 : e.key === "End" ? 800 : clamp(width + (e.key === "ArrowRight" ? 20 : -20))); } }}><GripVertical className="mt-5 h-4 w-4 text-muted-foreground/60" /></div>
  </section>;
}
