"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SearchableSelectField } from "@/components/ui/searchable-select-field";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { sortByName } from "@/lib/collections";
import { getStoredUser } from "@/lib/session";
import {
  gmudsService,
  type CreateGmudPayload,
  type Gmud,
  type GmudCompanyOption,
  type GmudUser,
} from "@/lib/services/gmuds.service";
import { DateTimePickerField } from "@/components/ui/datetime-picker-field";
import { UserSearchDialog } from "./user-search-dialog";
import { GmudStepper } from "./gmud-stepper";
import { GmudStatusBadge } from "./gmud-status-badge";

type SelectedUser = GmudUser;

type ActivityDraft = {
  scheduledAt: string;
  durationMinutes: number;
  executorUserId: string;
  description: string;
};

function toDatetimeLocalValue(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocalValue(value: string) {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

function formatDurationLabel(minutes: number) {
  if (!minutes || minutes < 1) return "—";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}

function hoursFromMinutes(minutes: number) {
  return Math.round((minutes / 60) * 100) / 100;
}

function minutesFromHours(hours: number) {
  if (!Number.isFinite(hours) || hours <= 0) return 30;
  return Math.max(5, Math.round(hours * 60));
}

export function GmudForm({
  initial,
  mode,
}: {
  initial?: Gmud;
  mode: "create" | "edit" | "view";
}) {
  const router = useRouter();
  const authUser = getStoredUser();
  const isClient = authUser?.role === "CLIENT";

  const [companies, setCompanies] = useState<GmudCompanyOption[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [companiesError, setCompaniesError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [companyId, setCompanyId] = useState(
    isClient ? authUser?.companyId ?? "" : initial?.companyId ?? ""
  );
  const [downtime, setDowntime] = useState<boolean>(initial?.downtime ?? false);
  const [downtimeStart, setDowntimeStart] = useState(
    toDatetimeLocalValue(initial?.downtimeStart)
  );
  const [downtimeEnd, setDowntimeEnd] = useState(
    toDatetimeLocalValue(initial?.downtimeEnd)
  );

  const [responsible, setResponsible] = useState<SelectedUser | null>(
    initial?.responsible ?? null
  );
  const [description, setDescription] = useState(initial?.description ?? "");
  const [reason, setReason] = useState(initial?.reason ?? "");
  const [impact, setImpact] = useState(initial?.impact ?? "");
  const [rollback, setRollback] = useState(initial?.rollback ?? "");

  const [executors, setExecutors] = useState<SelectedUser[]>(
    initial?.executors?.map((e) => e.user) ?? []
  );
  const [approvers, setApprovers] = useState<SelectedUser[]>(
    initial?.approvers?.map((a) => a.user) ?? []
  );

  const [activities, setActivities] = useState<ActivityDraft[]>(
    initial?.activities?.map((a) => ({
      scheduledAt: toDatetimeLocalValue(a.scheduledAt),
      durationMinutes: a.durationMinutes,
      executorUserId: a.executorUserId,
      description: a.description,
    })) ?? []
  );

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<
    "responsible" | "executor" | "approver"
  >("executor");

  const readonly = mode === "view";
  const canEdit =
    mode !== "view" &&
    (!initial ||
      initial.status === "DRAFT" ||
      initial.status === "PENDING_APPROVAL");

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (isClient) return;
      setLoadingCompanies(true);
      setCompaniesError(null);
      try {
        const data = await gmudsService.listCompanies();
        if (!cancelled) {
          setCompanies(sortByName(data));
          if (data.length === 1) {
            setCompanyId((prev) => prev || data[0].id);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setCompanies([]);
          setCompaniesError(
            err instanceof Error
              ? err.message
              : "Não foi possível carregar as empresas.",
          );
        }
      } finally {
        if (!cancelled) setLoadingCompanies(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [isClient]);

  const companyLocked = isClient || (companies.length <= 1 && !loadingCompanies);

  const executorOptions = useMemo(() => sortByName(executors), [executors]);

  function addUnique(list: SelectedUser[], user: SelectedUser) {
    if (list.some((u) => u.id === user.id)) return list;
    return [...list, user];
  }

  async function handleSave(submitForApproval: boolean) {
    setSaving(true);
    setError(null);
    try {
      if (!companyId) throw new Error("Selecione a empresa.");
      if (!title.trim()) throw new Error("Informe o título.");
      if (executors.length < 1) throw new Error("Informe ao menos 1 executor.");
      if (approvers.length < 2) throw new Error("Informe ao menos 2 aprovadores.");

      const payload: CreateGmudPayload = {
        title: title.trim(),
        companyId,
        downtime,
        ...(downtime
          ? {
              downtimeStart: fromDatetimeLocalValue(downtimeStart),
              downtimeEnd: fromDatetimeLocalValue(downtimeEnd),
            }
          : {}),
        ...(responsible?.id ? { responsibleId: responsible.id } : {}),
        description: description.trim() || undefined,
        reason: reason.trim() || undefined,
        impact: impact.trim() || undefined,
        rollback: rollback.trim() || undefined,
        executors: executors.map((u) => ({ userId: u.id })),
        approvers: approvers.map((u) => ({ userId: u.id })),
        activities: activities.length
          ? activities.map((a) => ({
              scheduledAt: fromDatetimeLocalValue(a.scheduledAt) ?? new Date().toISOString(),
              durationMinutes: Number(a.durationMinutes),
              executorUserId: a.executorUserId,
              description: a.description,
            }))
          : undefined,
        submitForApproval,
      };

      if (initial?.id) {
        const updated = await gmudsService.update(initial.id, payload);
        router.replace(`/gmud/${updated.id}`);
        router.refresh();
      } else {
        const created = await gmudsService.create(payload);
        router.replace(`/gmud/${created.id}`);
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar GMUD");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {initial ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">GMUD</div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-xl font-bold text-foreground">
                #{initial.code} — {initial.title}
              </div>
              <GmudStatusBadge status={initial.status} />
            </div>
          </div>
        </div>
      ) : null}

      <GmudStepper status={initial?.status ?? "DRAFT"} />

      {error ? (
        <div className="alle-alert-error rounded-xl p-4 text-sm">
          {error}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">
            Campos principais
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Título / Nome da mudança <span className="text-destructive">*</span>
              </div>
            </div>
            <Input
              value={title}
              disabled={readonly || !canEdit}
              onChange={(e) => setTitle(e.target.value)}
              className="h-12 text-base"
              placeholder="Ex.: Atualização do firewall da borda"
            />
            <div className="text-xs text-muted-foreground">
              Use um título objetivo para facilitar aprovação e rastreabilidade.
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              Empresa <span className="text-destructive">*</span>
            </div>
            {companyLocked ? (
              <Input
                value={
                  authUser?.companyName ??
                  companies.find((c) => c.id === companyId)?.name ??
                  ""
                }
                disabled
                className=""
              />
            ) : (
              <div className="flex gap-2">
                <SearchableSelectField
                  value={companyId}
                  disabled={readonly || !canEdit || loadingCompanies}
                  onChange={setCompanyId}
                  options={companies.map((c) => ({ value: c.id, label: c.name }))}
                  placeholder="Selecione a empresa"
                  alwaysShowSearch
                  popoverMinWidth="min-w-[min(28rem,calc(100vw-2rem))]"
                  className="min-w-0 flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={readonly || !canEdit || loadingCompanies}
                  onClick={async () => {
                    setLoadingCompanies(true);
                    setCompaniesError(null);
                    try {
                      const data = await gmudsService.listCompanies();
                      setCompanies(sortByName(data));
                    } catch (err) {
                      setCompaniesError(
                        err instanceof Error
                          ? err.message
                          : "Não foi possível carregar as empresas.",
                      );
                    } finally {
                      setLoadingCompanies(false);
                    }
                  }}
                  className="h-11 shrink-0"
                >
                  Atualizar
                </Button>
              </div>
            )}
            {!companyLocked ? (
              <div className="text-xs text-muted-foreground">
                Selecione a empresa para habilitar busca de usuários.
              </div>
            ) : null}
            {companiesError ? (
              <div className="alle-alert-error rounded-lg px-3 py-2 text-xs">
                {companiesError}
              </div>
            ) : null}
            {!companyLocked && !loadingCompanies && companies.length === 0 && !companiesError ? (
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                Nenhuma empresa disponível para sua conta nesta GMUD.
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">Responsável</div>
            <div className="flex gap-2">
              <Input
                value={responsible ? `${responsible.name} (${responsible.email})` : ""}
                disabled
                className="min-w-0 flex-1"
                placeholder="Selecione um usuário"
              />
              <Button
                type="button"
                disabled={readonly || !canEdit || !companyId}
                onClick={() => {
                  setPickerTarget("responsible");
                  setPickerOpen(true);
                }}
                variant="secondary"
                className="shrink-0"
              >
                Buscar
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              Opcional. Ajuda a identificar quem responde pela mudança.
            </div>
          </div>

          <div className="space-y-2 md:col-span-2">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Downtime</div>
              <label className="inline-flex items-center gap-3 text-sm text-muted-foreground">
                <span className="text-muted-foreground">Não</span>
                <button
                  type="button"
                  disabled={readonly || !canEdit}
                  onClick={() => setDowntime((v) => !v)}
                  className={[
                    "relative inline-flex h-7 w-12 items-center rounded-full border transition",
                    downtime
                      ? "border-primary/40 bg-primary/20"
                      : "border-border bg-muted/40",
                    readonly || !canEdit
                      ? "cursor-not-allowed opacity-60"
                      : "hover:bg-muted/60",
                  ].join(" ")}
                  aria-pressed={downtime}
                  aria-label="Downtime"
                >
                  <span
                    className={[
                      "inline-block h-5 w-5 rounded-full transition",
                      downtime ? "translate-x-6 bg-primary" : "translate-x-1 bg-muted-foreground",
                    ].join(" ")}
                  />
                </button>
                <span className="text-muted-foreground">Sim</span>
              </label>
            </div>
            {downtime ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Início do downtime</div>
                  <DateTimePickerField
                    value={downtimeStart}
                    disabled={readonly || !canEdit}
                    onChange={setDowntimeStart}
                    datePlaceholder="Data de início"
                  />
                </div>
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Fim do downtime</div>
                  <DateTimePickerField
                    value={downtimeEnd}
                    disabled={readonly || !canEdit}
                    onChange={setDowntimeEnd}
                    datePlaceholder="Data de fim"
                  />
                </div>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm text-muted-foreground">Executor(es)</CardTitle>
          <Button
            type="button"
            disabled={readonly || !canEdit || !companyId}
            onClick={() => {
              setPickerTarget("executor");
              setPickerOpen(true);
            }}
            variant="secondary"
          >
            + Adicionar
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {executors.length === 0 ? (
            <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              Nenhum executor selecionado. <span className="text-destructive">*</span>
            </div>
          ) : null}
          {executors.map((u) => (
            <div
              key={u.id}
              className="flex flex-col gap-2 rounded-xl border border-border bg-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="text-sm">
                <div className="font-semibold">{u.name}</div>
                <div className="text-xs text-muted-foreground">{u.email}</div>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={readonly || !canEdit}
                className=""
                onClick={() => setExecutors((prev) => prev.filter((x) => x.id !== u.id))}
              >
                Remover
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm text-muted-foreground">Aprovador(es)</CardTitle>
          <Button
            type="button"
            disabled={readonly || !canEdit || !companyId}
            onClick={() => {
              setPickerTarget("approver");
              setPickerOpen(true);
            }}
            variant="secondary"
          >
            + Adicionar
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {approvers.length === 0 ? (
            <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              Nenhum aprovador selecionado. <span className="text-destructive">*</span>
            </div>
          ) : null}
          {approvers.map((u) => (
            <div
              key={u.id}
              className="flex flex-col gap-2 rounded-xl border border-border bg-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="text-sm">
                <div className="font-semibold">{u.name}</div>
                <div className="text-xs text-muted-foreground">{u.email}</div>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={readonly || !canEdit}
                className=""
                onClick={() => setApprovers((prev) => prev.filter((x) => x.id !== u.id))}
              >
                Remover
              </Button>
            </div>
          ))}
          <div className="text-xs text-muted-foreground">Mínimo: 2 aprovadores.</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Conteúdo</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <div className="text-sm text-muted-foreground">Descrição</div>
            <Textarea
              value={description}
              disabled={readonly || !canEdit}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[120px]"
              placeholder="Descreva a mudança em detalhes"
            />
          </div>
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">Motivo</div>
            <Textarea
              value={reason}
              disabled={readonly || !canEdit}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-[120px]"
            />
          </div>
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">Impacto</div>
            <Textarea
              value={impact}
              disabled={readonly || !canEdit}
              onChange={(e) => setImpact(e.target.value)}
              className="min-h-[120px]"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <div className="text-sm text-muted-foreground">Rollback</div>
            <Textarea
              value={rollback}
              disabled={readonly || !canEdit}
              onChange={(e) => setRollback(e.target.value)}
              className="min-h-[120px]"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-sm text-muted-foreground">Agenda da GMUD</CardTitle>
            <p className="text-xs text-muted-foreground">
              Cronograma de execução: data, hora, duração em horas e responsável por atividade
              (mesmo padrão de data do dashboard).
            </p>
          </div>
          <Button
            type="button"
            disabled={readonly || !canEdit}
            onClick={() =>
              setActivities((prev) => [
                ...prev,
                { scheduledAt: "", durationMinutes: 60, executorUserId: "", description: "" },
              ])
            }
            variant="secondary"
          >
            + Adicionar atividade
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {activities.length === 0 ? (
            <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              Nenhuma atividade na agenda.
            </div>
          ) : null}

          {activities.map((a, idx) => (
            <div key={idx} className="rounded-xl border border-border bg-muted/40 p-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <div className="space-y-2 md:col-span-2">
                  <div className="text-sm text-muted-foreground">Data e hora</div>
                  <DateTimePickerField
                    value={a.scheduledAt}
                    disabled={readonly || !canEdit}
                    datePlaceholder="Data da atividade"
                    onChange={(next) =>
                      setActivities((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, scheduledAt: next } : x))
                      )
                    }
                  />
                </div>
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Duração (horas)</div>
                  <Input
                    type="number"
                    min={0.25}
                    step={0.25}
                    value={hoursFromMinutes(a.durationMinutes)}
                    disabled={readonly || !canEdit}
                    onChange={(e) =>
                      setActivities((prev) =>
                        prev.map((x, i) =>
                          i === idx
                            ? {
                                ...x,
                                durationMinutes: minutesFromHours(Number(e.target.value)),
                              }
                            : x
                        )
                      )
                    }
                    className=""
                  />
                  <p className="text-xs text-muted-foreground">
                    {formatDurationLabel(a.durationMinutes)}
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Executor</div>
                  <SearchableSelectField
                    value={a.executorUserId}
                    disabled={readonly || !canEdit}
                    onChange={(value) =>
                      setActivities((prev) =>
                        prev.map((x, i) =>
                          i === idx ? { ...x, executorUserId: value } : x,
                        ),
                      )
                    }
                    options={executorOptions.map((u) => ({
                      value: u.id,
                      label: u.name,
                    }))}
                    emptyLabel="Selecione..."
                  />
                </div>
                <div className="space-y-2 md:col-span-4">
                  <div className="text-sm text-muted-foreground">Descrição da atividade</div>
                  <Input
                    value={a.description}
                    disabled={readonly || !canEdit}
                    onChange={(e) =>
                      setActivities((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, description: e.target.value } : x))
                      )
                    }
                    className=""
                    placeholder="Ex.: Aplicar regra X no firewall"
                  />
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={readonly || !canEdit}
                  className=""
                  onClick={() => setActivities((prev) => prev.filter((_, i) => i !== idx))}
                >
                  Remover atividade
                </Button>
              </div>
            </div>
          ))}

          <div className="text-xs text-muted-foreground">
            Regra: o executor da atividade deve ser um dos executores cadastrados na GMUD.
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        {mode !== "view" ? (
          <>
            <Button
              type="button"
              disabled={saving || readonly || !canEdit}
              variant="outline"
              className="h-11"
              onClick={() => handleSave(false)}
            >
              Salvar rascunho
            </Button>
            <Button
              type="button"
              disabled={saving || readonly || !canEdit}
              className="h-11"
              onClick={() => handleSave(true)}
            >
              Salvar e enviar para aprovação
            </Button>
          </>
        ) : null}
      </div>

      <UserSearchDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        companyId={companyId || undefined}
        title={
          pickerTarget === "responsible"
            ? "Selecionar responsável"
            : pickerTarget === "executor"
              ? "Selecionar executor"
              : "Selecionar aprovador"
        }
        onSelect={(u) => {
          if (pickerTarget === "responsible") {
            setResponsible(u);
            return;
          }
          if (pickerTarget === "executor") {
            setExecutors((prev) => addUnique(prev, u));
            return;
          }
          setApprovers((prev) => addUnique(prev, u));
        }}
      />
    </div>
  );
}

