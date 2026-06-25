"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  GitBranch,
  Loader2,
  ListChecks,
  StickyNote,
  UserRound,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SearchableSelectField } from "@/components/ui/searchable-select-field";
import { FlipCheckbox } from "@/components/ui/flip-checkbox";
import {
  flattenProjectActivities,
  projetosService,
  type ProjectActivity,
  type ProjectUserOption,
} from "@/lib/services/projetos.service";

export type ActivityFormMode =
  | { kind: "create"; projectId: string; parentId?: string }
  | { kind: "edit"; activity: ProjectActivity };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: ActivityFormMode | null;
  companyId: string;
  allActivities: ProjectActivity[];
  onSaved: () => void;
};

export function ProjectActivityModal({
  open,
  onOpenChange,
  mode,
  companyId,
  allActivities,
  onSaved,
}: Props) {
  const flat = useMemo(() => flattenProjectActivities(allActivities), [allActivities]);
  const editing = mode?.kind === "edit" ? mode.activity : null;

  const [name, setName] = useState("");
  const [durationDays, setDurationDays] = useState("1");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [actualDurationDays, setActualDurationDays] = useState("");
  const [progressPercent, setProgressPercent] = useState("0");
  const [assigneeUserId, setAssigneeUserId] = useState("");
  const [assigneeName, setAssigneeName] = useState("");
  const [assigneeFreeText, setAssigneeFreeText] = useState(false);
  const [isMilestone, setIsMilestone] = useState(false);
  const [notes, setNotes] = useState("");
  const [predecessorIds, setPredecessorIds] = useState<string[]>([]);
  const [userOptions, setUserOptions] = useState<ProjectUserOption[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !mode) return;
    if (mode.kind === "edit") {
      const a = mode.activity;
      setName(a.name);
      setDurationDays(String(a.durationDays));
      setStartDate(a.startDate ?? "");
      setEndDate(a.endDate ?? "");
      setActualDurationDays(
        a.actualDurationDays != null ? String(a.actualDurationDays) : "",
      );
      setProgressPercent(String(a.progressPercent));
      setAssigneeUserId(a.assigneeUserId ?? "");
      setAssigneeName(a.assigneeName ?? "");
      setAssigneeFreeText(!a.assigneeUserId && Boolean(a.assigneeName));
      setIsMilestone(a.isMilestone);
      setNotes(a.notes ?? "");
      setPredecessorIds(a.predecessorIds);
    } else {
      setName("");
      setDurationDays("1");
      setStartDate("");
      setEndDate("");
      setActualDurationDays("");
      setProgressPercent("0");
      setAssigneeUserId("");
      setAssigneeName("");
      setAssigneeFreeText(false);
      setIsMilestone(false);
      setNotes("");
      setPredecessorIds([]);
    }
  }, [open, mode]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        setLoadingUsers(true);
        const users = await projetosService.searchUsers({
          q: userSearch,
          companyId,
        });
        if (!cancelled) setUserOptions(users);
      } finally {
        if (!cancelled) setLoadingUsers(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, userSearch, companyId]);

  const predecessorOptions = useMemo(
    () =>
      flat
        .filter((row) => row.id !== editing?.id)
        .map((row) => ({
          value: row.id,
          label: `${row.wbsCode} — ${row.name}`,
        })),
    [flat, editing?.id],
  );

  async function handleSubmit() {
    if (!mode || !name.trim()) return;
    try {
      setSaving(true);
      const payload = {
        name: name.trim(),
        durationDays: isMilestone ? 0 : Math.max(0, Number(durationDays) || 0),
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        actualDurationDays: actualDurationDays
          ? Math.max(0, Number(actualDurationDays) || 0)
          : undefined,
        progressPercent: Math.min(
          100,
          Math.max(0, Number(progressPercent) || 0),
        ),
        assigneeUserId: assigneeFreeText ? undefined : assigneeUserId || undefined,
        assigneeName: assigneeFreeText ? assigneeName.trim() || undefined : undefined,
        isMilestone,
        notes: notes.trim() || undefined,
        predecessorIds,
      };

      if (mode.kind === "create") {
        await projetosService.createActivity(mode.projectId, {
          ...payload,
          parentId: mode.parentId,
          predecessorIds,
        });
      } else {
        await projetosService.updateActivity(mode.activity.id, {
          ...payload,
          assigneeUserId: assigneeFreeText ? null : assigneeUserId || null,
          assigneeName: assigneeFreeText ? assigneeName.trim() || null : null,
          predecessorIds,
        });
      }
      onSaved();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  const isEdit = mode?.kind === "edit";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="font-sans flex max-h-[90vh] w-[95vw] max-w-[640px] flex-col overflow-hidden border border-border bg-card p-0 text-card-foreground sm:max-w-[720px]"
      >
        <div className="relative shrink-0 border-b border-border px-5 py-5 sm:px-6">
          <DialogHeader className="space-y-3 text-left">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary sm:h-12 sm:w-12">
              <ListChecks size={22} />
            </div>
            <div className="space-y-1">
              <DialogTitle className="text-xl font-bold text-foreground sm:text-2xl">
                {isEdit ? "Editar atividade" : "Nova atividade"}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Defina prazos, responsável e dependências da atividade no cronograma.
              </DialogDescription>
            </div>
          </DialogHeader>

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
          <div className="space-y-2">
            <Label htmlFor="activity-name" className="text-sm font-semibold text-foreground">
              Nome da tarefa
            </Label>
            <Input
              id="activity-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Especificação técnica"
              className="h-11"
            />
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3 transition hover:bg-muted/50">
            <FlipCheckbox
              checked={isMilestone}
              onChange={(e) => setIsMilestone(e.target.checked)}
            />
            <span className="space-y-0.5">
              <span className="block text-sm font-medium text-foreground">
                Marco (duração zero)
              </span>
              <span className="block text-xs text-muted-foreground">
                Ponto de controle sem duração no cronograma.
              </span>
            </span>
          </label>

          <section className="space-y-4 rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 text-foreground">
              <CalendarClock className="h-4 w-4 text-primary" />
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Prazos
              </h3>
            </div>

            {!isMilestone ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="duration" className="text-sm">Duração (dias)</Label>
                  <Input
                    id="duration"
                    type="number"
                    min={0}
                    value={durationDays}
                    onChange={(e) => setDurationDays(e.target.value)}
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="start" className="text-sm">Início</Label>
                  <Input
                    id="start"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end" className="text-sm">Término</Label>
                  <Input
                    id="end"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="h-11"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2 sm:max-w-xs">
                <Label htmlFor="milestone-date" className="text-sm">Data do marco</Label>
                <Input
                  id="milestone-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setEndDate(e.target.value);
                  }}
                  className="h-11"
                />
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="actual" className="text-sm">Tempo real (dias)</Label>
                <Input
                  id="actual"
                  type="number"
                  min={0}
                  value={actualDurationDays}
                  onChange={(e) => setActualDurationDays(e.target.value)}
                  placeholder="—"
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="progress" className="text-sm">% andamento</Label>
                <Input
                  id="progress"
                  type="number"
                  min={0}
                  max={100}
                  value={progressPercent}
                  onChange={(e) => setProgressPercent(e.target.value)}
                  className="h-11"
                />
              </div>
            </div>
          </section>

          <section className="space-y-3 rounded-xl border border-border p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-foreground">
                <UserRound className="h-4 w-4 text-primary" />
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Responsável
                </h3>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <FlipCheckbox
                  checked={assigneeFreeText}
                  onChange={(e) => setAssigneeFreeText(e.target.checked)}
                />
                Texto livre
              </label>
            </div>

            {assigneeFreeText ? (
              <Input
                value={assigneeName}
                onChange={(e) => setAssigneeName(e.target.value)}
                placeholder="Nome do responsável"
                className="h-11"
              />
            ) : (
              <div className="space-y-2">
                <Input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Buscar por nome ou e-mail..."
                  className="h-11"
                />
                <SearchableSelectField
                  modal
                  value={assigneeUserId}
                  onChange={setAssigneeUserId}
                  options={userOptions.map((u) => ({
                    value: u.id,
                    label: `${u.name} (${u.email})`,
                  }))}
                  loading={loadingUsers}
                  placeholder="Selecione o responsável"
                  emptyLabel="Nenhum usuário encontrado"
                  preserveOrder
                />
              </div>
            )}
          </section>

          <section className="space-y-3 rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 text-foreground">
              <GitBranch className="h-4 w-4 text-primary" />
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Predecessoras
              </h3>
            </div>
            <SearchableSelectField
              modal
              value=""
              onChange={(value) => {
                if (!value || predecessorIds.includes(value)) return;
                setPredecessorIds((prev) => [...prev, value]);
              }}
              options={predecessorOptions.filter(
                (opt) => !predecessorIds.includes(opt.value),
              )}
              placeholder="Adicionar predecessora..."
              emptyLabel="Sem outras atividades"
              preserveOrder
            />
            {predecessorIds.length ? (
              <div className="flex flex-wrap gap-2">
                {predecessorIds.map((id) => {
                  const label =
                    predecessorOptions.find((o) => o.value === id)?.label ?? id;
                  return (
                    <button
                      key={id}
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition hover:bg-primary/20"
                      onClick={() =>
                        setPredecessorIds((prev) => prev.filter((x) => x !== id))
                      }
                    >
                      <span className="max-w-[220px] truncate">{label}</span>
                      <X className="h-3 w-3" />
                    </button>
                  );
                })}
              </div>
            ) : null}
          </section>

          <div className="space-y-2">
            <Label htmlFor="notes" className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <StickyNote className="h-4 w-4 text-muted-foreground" />
              Observações
            </Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Detalhes, riscos ou comentários sobre a atividade..."
              className="min-h-[88px]"
            />
          </div>
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-muted/30 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={saving || !name.trim()}
            onClick={() => void handleSubmit()}
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isEdit ? "Salvar alterações" : "Criar atividade"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
