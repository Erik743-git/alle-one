"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarClock,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Trash2,
  Workflow,
} from "lucide-react";

import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import AppShell from "@/components/layout/app-shell";
import { TicketAutoOpenRuleDialog } from "@/components/admin/ticket-auto-open-rule-dialog";
import {
  TicketAutomationRuleDialog,
  formatAutomationSummary,
} from "@/components/admin/ticket-automation-rule-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FlipCheckbox } from "@/components/ui/flip-checkbox";
import { useConfirm } from "@/lib/confirm";
import { notifyError, notifySuccess } from "@/lib/notify";
import { cn } from "@/lib/utils";
import {
  adminService,
  type TicketAutoOpenRule,
  type TicketAutomationRule,
  type TicketStage,
} from "@/lib/services/admin.service";

type AdminTicketTab = "stages" | "auto-open" | "automations";

const RULES_PAGE_SIZE = 10;

function StageBadges({ stage }: { stage: TicketStage }) {
  if (!stage.isSystem && stage.active) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {stage.isSystem ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
          <Lock className="h-3 w-3" />
          Padrão
        </span>
      ) : null}
      {!stage.active ? (
        <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
          Inativo
        </span>
      ) : null}
    </div>
  );
}

function formatRuleDate(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

export default function AdminTicketPage() {
  const confirm = useConfirm();
  const [tab, setTab] = useState<AdminTicketTab>("stages");

  const [stages, setStages] = useState<TicketStage[]>([]);
  const [rules, setRules] = useState<TicketAutoOpenRule[]>([]);
  const [automations, setAutomations] = useState<TicketAutomationRule[]>([]);
  const [loadingStages, setLoadingStages] = useState(true);
  const [loadingRules, setLoadingRules] = useState(true);
  const [loadingAutomations, setLoadingAutomations] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingRuleId, setTogglingRuleId] = useState<string | null>(null);
  const [runningDueRules, setRunningDueRules] = useState(false);
  const [togglingAutomationId, setTogglingAutomationId] = useState<string | null>(
    null,
  );

  const [stageModalOpen, setStageModalOpen] = useState(false);
  const [editingStage, setEditingStage] = useState<TicketStage | null>(null);
  const [stageName, setStageName] = useState("");

  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<TicketAutoOpenRule | null>(
    null,
  );

  const [automationDialogOpen, setAutomationDialogOpen] = useState(false);
  const [editingAutomation, setEditingAutomation] =
    useState<TicketAutomationRule | null>(null);
  const [rulesPage, setRulesPage] = useState(1);

  const loadStages = useCallback(async () => {
    try {
      setLoadingStages(true);
      const data = await adminService.listTicketStages();
      setStages(Array.isArray(data) ? data : []);
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível carregar os estágios.",
      );
      setStages([]);
    } finally {
      setLoadingStages(false);
    }
  }, []);

  const loadRules = useCallback(async () => {
    try {
      setLoadingRules(true);
      const data = await adminService.listTicketAutoOpenRules();
      setRules(Array.isArray(data) ? data : []);
    } catch (err) {
      notifyError(
        err instanceof Error
          ? err.message
          : "Não foi possível carregar as regras de abertura automática.",
      );
      setRules([]);
    } finally {
      setLoadingRules(false);
    }
  }, []);

  const loadAutomations = useCallback(async () => {
    try {
      setLoadingAutomations(true);
      const data = await adminService.listTicketAutomationRules();
      setAutomations(Array.isArray(data) ? data : []);
    } catch (err) {
      notifyError(
        err instanceof Error
          ? err.message
          : "Não foi possível carregar as automações.",
      );
      setAutomations([]);
    } finally {
      setLoadingAutomations(false);
    }
  }, []);

  useEffect(() => {
    void loadStages();
    void loadRules();
    void loadAutomations();
  }, [loadStages, loadRules, loadAutomations]);

  const rulesTotalPages = Math.max(1, Math.ceil(rules.length / RULES_PAGE_SIZE));
  const paginatedRules = useMemo(() => {
    const start = (rulesPage - 1) * RULES_PAGE_SIZE;
    return rules.slice(start, start + RULES_PAGE_SIZE);
  }, [rules, rulesPage]);
  const rulesCanPrev = rulesPage > 1;
  const rulesCanNext = rulesPage < rulesTotalPages;

  useEffect(() => {
    if (rulesPage > rulesTotalPages) {
      setRulesPage(rulesTotalPages);
    }
  }, [rulesPage, rulesTotalPages]);

  function openCreateStage() {
    setEditingStage(null);
    setStageName("");
    setStageModalOpen(true);
  }

  function openEditStage(stage: TicketStage) {
    setEditingStage(stage);
    setStageName(stage.name);
    setStageModalOpen(true);
  }

  async function handleSaveStage() {
    const trimmed = stageName.trim();
    if (!trimmed) {
      notifyError("Informe o nome do estágio.");
      return;
    }
    try {
      setSaving(true);
      if (editingStage) {
        await adminService.updateTicketStage(editingStage.id, { name: trimmed });
        notifySuccess("Estágio atualizado.");
      } else {
        await adminService.createTicketStage({ name: trimmed });
        notifySuccess("Estágio criado.");
      }
      setStageModalOpen(false);
      await loadStages();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Falha ao salvar o estágio.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteStage(stage: TicketStage) {
    const ok = await confirm({
      title: "Remover estágio",
      description: `Remover o estágio "${stage.name}"?`,
      confirmText: "Remover",
      variant: "error",
    });
    if (!ok) return;
    try {
      setDeletingId(stage.id);
      await adminService.deleteTicketStage(stage.id);
      notifySuccess("Estágio removido.");
      await loadStages();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Falha ao remover o estágio.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleRunDueRules() {
    try {
      setRunningDueRules(true);
      const result = await adminService.runDueTicketAutoOpenRules();
      if (result.processed > 0) {
        notifySuccess(
          `${result.processed} ticket(s) aberto(s) pelas rotinas vencidas.`,
        );
      } else if (result.errors > 0) {
        const firstError = result.results?.find((item) => !item.ok)?.error;
        notifyError(
          firstError
            ? `Falha ao abrir rotina: ${firstError}`
            : `Nenhum ticket aberto. ${result.errors} regra(s) com erro — verifique os logs da API.`,
        );
      } else {
        notifySuccess("Nenhuma rotina vencida no momento.");
      }
      await loadRules();
    } catch (err) {
      notifyError(
        err instanceof Error
          ? err.message
          : "Não foi possível executar as rotinas vencidas.",
      );
    } finally {
      setRunningDueRules(false);
    }
  }

  async function handleToggleRule(rule: TicketAutoOpenRule) {
    try {
      setTogglingRuleId(rule.id);
      await adminService.setTicketAutoOpenRuleActive(rule.id, !rule.active);
      await loadRules();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Falha ao alterar a regra.");
    } finally {
      setTogglingRuleId(null);
    }
  }

  async function handleDeleteRule(rule: TicketAutoOpenRule) {
    const ok = await confirm({
      title: "Remover regra",
      description: `Remover a regra "${rule.name}"?`,
      confirmText: "Remover",
      variant: "error",
    });
    if (!ok) return;
    try {
      setDeletingId(rule.id);
      await adminService.deleteTicketAutoOpenRule(rule.id);
      notifySuccess("Regra removida.");
      await loadRules();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Falha ao remover a regra.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleToggleAutomation(rule: TicketAutomationRule) {
    try {
      setTogglingAutomationId(rule.id);
      await adminService.setTicketAutomationRuleActive(rule.id, !rule.active);
      await loadAutomations();
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Falha ao alterar a automação.",
      );
    } finally {
      setTogglingAutomationId(null);
    }
  }

  async function handleDeleteAutomation(rule: TicketAutomationRule) {
    const ok = await confirm({
      title: "Remover automação",
      description: `Remover a automação "${rule.name}"?`,
      confirmText: "Remover",
      variant: "error",
    });
    if (!ok) return;
    try {
      setDeletingId(rule.id);
      await adminService.deleteTicketAutomationRule(rule.id);
      notifySuccess("Automação removida.");
      await loadAutomations();
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Falha ao remover a automação.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <ProtectedPage>
      <PermissionGate module="ADMIN">
        <AppShell>
          <div className="font-sans w-full space-y-6">
            <div className="space-y-2">
              <Button variant="ghost" size="sm" className="-ml-2 w-fit" asChild>
                <Link href="/admin">
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  Administração
                </Link>
              </Button>
              <h1 className="text-3xl font-bold text-foreground">Ticket</h1>
              <p className="text-muted-foreground">
                Estágios, abertura automática e automações por mudança de estágio
                (catálogo, classificação e cliente).
              </p>
            </div>

            <div className="flex flex-wrap gap-2 border-b border-border pb-2">
              <Button
                type="button"
                variant={tab === "stages" ? "default" : "ghost"}
                size="sm"
                onClick={() => setTab("stages")}
              >
                Estágios
              </Button>
              <Button
                type="button"
                variant={tab === "auto-open" ? "default" : "ghost"}
                size="sm"
                onClick={() => setTab("auto-open")}
              >
                <CalendarClock className="mr-2 size-4" />
                Abertura automática
              </Button>
              <Button
                type="button"
                variant={tab === "automations" ? "default" : "ghost"}
                size="sm"
                onClick={() => setTab("automations")}
              >
                <Workflow className="mr-2 size-4" />
                Automações
              </Button>
            </div>

            {tab === "stages" ? (
              <>
                <div className="flex justify-end">
                  <Button onClick={openCreateStage}>
                    <Plus className="mr-2 h-4 w-4" />
                    Adicionar estágio
                  </Button>
                </div>
                {loadingStages ? (
                  <div className="flex min-h-[30vh] items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    Carregando estágios…
                  </div>
                ) : (
                  <Card>
                    <CardContent className="divide-y divide-border p-0">
                      {stages.map((stage) => (
                        <div
                          key={stage.id}
                          className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0 space-y-1.5">
                            <p
                              className={cn(
                                "font-medium",
                                !stage.active && "text-muted-foreground",
                              )}
                            >
                              {stage.name}
                            </p>
                            <StageBadges stage={stage} />
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={stage.isSystem}
                              onClick={() => openEditStage(stage)}
                            >
                              <Pencil className="mr-1 h-4 w-4" />
                              Editar
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              disabled={stage.isSystem || deletingId === stage.id}
                              onClick={() => void handleDeleteStage(stage)}
                            >
                              {deletingId === stage.id ? (
                                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="mr-1 h-4 w-4" />
                              )}
                              Remover
                            </Button>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </>
            ) : tab === "auto-open" ? (
              <>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    variant="outline"
                    disabled={runningDueRules}
                    onClick={() => void handleRunDueRules()}
                  >
                    {runningDueRules ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CalendarClock className="mr-2 h-4 w-4" />
                    )}
                    Executar vencidas
                  </Button>
                  <Button
                    onClick={() => {
                      setEditingRule(null);
                      setRuleDialogOpen(true);
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Criar regra
                  </Button>
                </div>
                {loadingRules ? (
                  <div className="flex min-h-[30vh] items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    Carregando regras…
                  </div>
                ) : rules.length === 0 ? (
                  <Card>
                    <CardContent className="py-10 text-center text-sm text-muted-foreground">
                      Nenhuma regra de abertura automática cadastrada.
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    <Card>
                      <CardContent className="divide-y divide-border p-0">
                        {paginatedRules.map((rule) => (
                        <div
                          key={rule.id}
                          className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between"
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium text-foreground">
                                {rule.name}
                              </p>
                              {!rule.active ? (
                                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                  Inativa
                                </span>
                              ) : null}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {rule.periodicityLabel} · próximo{" "}
                              {formatRuleDate(rule.nextScheduledDate)} às{" "}
                              {rule.scheduleTime}
                            </p>
                            <p className="truncate text-sm text-muted-foreground">
                              {rule.title}
                            </p>
                            {rule.lastTicketNumber ? (
                              <p className="text-xs text-muted-foreground">
                                Último ticket: #{rule.lastTicketNumber}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <label className="flex items-center gap-2 text-sm">
                              <FlipCheckbox
                                checked={rule.active}
                                disabled={togglingRuleId === rule.id}
                                onChange={() => void handleToggleRule(rule)}
                              />
                              Ativa
                            </label>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditingRule(rule);
                                setRuleDialogOpen(true);
                              }}
                            >
                              <Pencil className="mr-1 h-4 w-4" />
                              Editar
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              disabled={deletingId === rule.id}
                              onClick={() => void handleDeleteRule(rule)}
                            >
                              {deletingId === rule.id ? (
                                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="mr-1 h-4 w-4" />
                              )}
                              Remover
                            </Button>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                      <span>
                        {rules.length} regra(s) · página {rulesPage} de{" "}
                        {rulesTotalPages}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!rulesCanPrev}
                          onClick={() => setRulesPage((p) => Math.max(1, p - 1))}
                        >
                          Anterior
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!rulesCanNext}
                          onClick={() =>
                            setRulesPage((p) => Math.min(rulesTotalPages, p + 1))
                          }
                        >
                          Próxima
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex justify-end">
                  <Button
                    onClick={() => {
                      setEditingAutomation(null);
                      setAutomationDialogOpen(true);
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Criar automação
                  </Button>
                </div>
                {loadingAutomations ? (
                  <div className="flex min-h-[30vh] items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    Carregando automações…
                  </div>
                ) : automations.length === 0 ? (
                  <Card>
                    <CardContent className="py-10 text-center text-sm text-muted-foreground">
                      Nenhuma automação cadastrada. Crie regras para reagir à
                      mudança de estágio com base no catálogo, classificação e
                      cliente.
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="divide-y divide-border p-0">
                      {automations.map((rule) => (
                        <div
                          key={rule.id}
                          className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between"
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium text-foreground">
                                {rule.name}
                              </p>
                              {!rule.active ? (
                                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                  Inativa
                                </span>
                              ) : null}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {formatAutomationSummary(rule)}
                            </p>
                            {rule.description ? (
                              <p className="line-clamp-2 text-sm text-muted-foreground">
                                {rule.description}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <label className="flex items-center gap-2 text-sm">
                              <FlipCheckbox
                                checked={rule.active}
                                disabled={togglingAutomationId === rule.id}
                                onChange={() => void handleToggleAutomation(rule)}
                              />
                              Ativa
                            </label>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditingAutomation(rule);
                                setAutomationDialogOpen(true);
                              }}
                            >
                              <Pencil className="mr-1 h-4 w-4" />
                              Editar
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              disabled={deletingId === rule.id}
                              onClick={() => void handleDeleteAutomation(rule)}
                            >
                              {deletingId === rule.id ? (
                                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="mr-1 h-4 w-4" />
                              )}
                              Remover
                            </Button>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>

          <Dialog open={stageModalOpen} onOpenChange={setStageModalOpen}>
            <DialogContent className="flex w-[min(96vw,520px)] max-w-[520px] flex-col gap-0 overflow-hidden p-0">
              <DialogHeader className="px-6 pt-6 pb-2">
                <DialogTitle>
                  {editingStage ? "Editar estágio" : "Adicionar estágio"}
                </DialogTitle>
                <DialogDescription>
                  Defina o nome do estágio usado nos tickets.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 px-6 pb-4">
                <Label htmlFor="stage-name">Nome do estágio *</Label>
                <Input
                  id="stage-name"
                  value={stageName}
                  onChange={(e) => setStageName(e.target.value)}
                  maxLength={120}
                />
              </div>
              <DialogFooter className="!mx-0 !mb-0 !pb-4 shrink-0 flex-row justify-end gap-2 rounded-none border-t bg-muted/40 px-6 py-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setStageModalOpen(false)}
                  disabled={saving}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void handleSaveStage()}
                  disabled={saving}
                >
                  {saving ? "Salvando…" : editingStage ? "Salvar" : "Adicionar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <TicketAutoOpenRuleDialog
            open={ruleDialogOpen}
            onOpenChange={setRuleDialogOpen}
            editing={editingRule}
            onSaved={() => {
              notifySuccess(
                editingRule ? "Regra atualizada." : "Regra criada.",
              );
              void loadRules();
            }}
          />

          <TicketAutomationRuleDialog
            open={automationDialogOpen}
            onOpenChange={setAutomationDialogOpen}
            editing={editingAutomation}
            stages={stages}
            onSaved={() => {
              notifySuccess(
                editingAutomation ? "Automação atualizada." : "Automação criada.",
              );
              void loadAutomations();
            }}
          />
        </AppShell>
      </PermissionGate>
    </ProtectedPage>
  );
}
