"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CalendarRange,
  Download,
  FileSpreadsheet,
  FolderKanban,
  Loader2,
  Plus,
  RefreshCw,
  Upload,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

import AppShell from "@/components/layout/app-shell";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import {
  ProjectActivityModal,
  type ActivityFormMode,
} from "@/components/projetos/project-activity-modal";
import { ProjectBudgetDocumentsPanel } from "@/components/projetos/project-budget-documents-panel";
import {
  ProjectActivityTable,
  ProjectGanttChart,
  ProjectProgressHeader,
} from "@/components/projetos/project-gantt-parts";
import { Button } from "@/components/ui/button";
import {
  canEditProjetos,
  canImportProjetos,
  isAdmin,
  isClient,
} from "@/lib/access-control";
import { useConfirm } from "@/lib/confirm";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  flattenProjectActivities,
  PROJECT_STATUS_LABELS,
  projetosService,
  type ProjectActivity,
  type ProjectDetail,
  type ProjectStatus,
} from "@/lib/services/projetos.service";

const PROJECT_STATUS_STYLES: Record<ProjectStatus, string> = {
  PLANNING: "bg-sky-500/15 text-sky-400",
  IN_PROGRESS: "bg-primary/15 text-primary",
  ON_HOLD: "bg-amber-500/15 text-amber-400",
  COMPLETED: "bg-emerald-500/15 text-emerald-400",
  CANCELED: "bg-rose-500/15 text-rose-400",
};

function formatRangeDate(value: string | null): string {
  if (!value) return "—";
  const d = parseISO(value);
  return Number.isNaN(d.getTime()) ? "—" : format(d, "dd/MM/yyyy", { locale: ptBR });
}

export default function ProjectDetailPage() {
  const params = useParams<{ companyId: string; projectId: string }>();
  const companyId = params.companyId;
  const projectId = params.projectId;
  const canEdit = canEditProjetos();
  const canImport = canImportProjetos();
  const adminUser = isAdmin();
  const clientUser = isClient();
  const confirm = useConfirm();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ActivityFormMode | null>(null);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!projectId) return;
    try {
      if (silent) setRefreshing(true);
      else setLoading(true);
      const data = await projetosService.getProject(projectId);
      setProject(data);
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível carregar o projeto.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const flat = useMemo(
    () => (project ? flattenProjectActivities(project.activities) : []),
    [project],
  );

  const activityNameById = useMemo(
    () => new Map(flat.map((row) => [row.id, `${row.wbsCode} ${row.name}`])),
    [flat],
  );

  function openCreate(parentId?: string) {
    if (!projectId) return;
    setModalMode({ kind: "create", projectId, parentId });
    setModalOpen(true);
  }

  function openEdit(activity: ProjectActivity) {
    setModalMode({ kind: "edit", activity });
    setModalOpen(true);
  }

  async function handleToggleDone(activity: ProjectActivity, done: boolean) {
    try {
      const updated = await projetosService.updateActivity(activity.id, {
        progressPercent: done ? 100 : 0,
      });
      setProject(updated);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Falha ao atualizar.");
    }
  }

  async function handleDelete(activity: ProjectActivity) {
    const ok = await confirm({
      title: "Excluir atividade?",
      description: `A tarefa "${activity.name}" e sub-atividades serão removidas.`,
      confirmText: "Excluir",
      variant: "error",
    });
    if (!ok) return;
    try {
      const updated = await projetosService.deleteActivity(activity.id);
      setProject(updated);
      notifySuccess("Atividade excluída.");
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Falha ao excluir.");
    }
  }

  async function handleExport(template = false) {
    if (!projectId) return;
    try {
      await projetosService.exportProject(projectId, template);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Falha ao exportar.");
    }
  }

  async function handleImport(file: File) {
    if (!projectId) return;
    try {
      setImporting(true);
      const result = await projetosService.importProject(projectId, file);
      setProject(result.project);
      notifySuccess(
        `Importação concluída: ${result.created} criadas, ${result.updated} atualizadas.` +
          (result.errors.length
            ? ` ${result.errors.length} aviso(s) — veja o console.`
            : ""),
      );
      if (result.errors.length) {
        console.warn("Erros de importação:", result.errors);
      }
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Falha ao importar.");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <ProtectedPage>
      <PermissionGate module="PROJECTS">
        <AppShell>
          <div className="font-sans w-full space-y-6">
            {loading || !project ? (
              <div className="flex items-center justify-center py-24 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                Carregando projeto...
              </div>
            ) : (
              <>
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-2">
                      {!clientUser ? (
                        <Link
                          href={`/projetos/${companyId}`}
                          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
                        >
                          <ArrowLeft className="mr-1 h-4 w-4" />
                          {project.company.name}
                        </Link>
                      ) : null}
                      <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
                        <FolderKanban className="h-7 w-7 shrink-0 text-primary" />
                        <span className="truncate">
                          <span className="text-muted-foreground">#{project.code}</span>{" "}
                          {project.name}
                        </span>
                      </h1>

                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${PROJECT_STATUS_STYLES[project.status]}`}
                        >
                          {PROJECT_STATUS_LABELS[project.status]}
                        </span>
                        {project.ticketNumber ? (
                          <Link
                            href={`/tickets/${project.ticketNumber}`}
                            className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-foreground hover:bg-muted/80"
                          >
                            Ticket #{project.ticketNumber}
                          </Link>
                        ) : null}
                        {project.startDate || project.endDate ? (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <CalendarRange className="h-3.5 w-3.5" />
                            {formatRangeDate(project.startDate)} →{" "}
                            {formatRangeDate(project.endDate)}
                          </span>
                        ) : null}
                        <span className="text-muted-foreground">
                          {flat.length}{" "}
                          {flat.length === 1 ? "atividade" : "atividades"}
                        </span>
                      </div>

                      {project.description ? (
                        <p className="max-w-2xl text-sm text-muted-foreground">
                          {project.description}
                        </p>
                      ) : null}
                    </div>

                    {canEdit ? (
                      <Button
                        type="button"
                        size="lg"
                        className="shrink-0"
                        onClick={() => openCreate()}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Nova atividade
                      </Button>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2 border-t pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={refreshing}
                      onClick={() => void load(true)}
                    >
                      <RefreshCw
                        className={`mr-1.5 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
                      />
                      Atualizar
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleExport(false)}
                    >
                      <Download className="mr-1.5 h-3.5 w-3.5" />
                      Exportar Excel
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleExport(true)}
                    >
                      <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
                      Modelo em branco
                    </Button>
                    {canImport ? (
                      <>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void handleImport(file);
                          }}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={importing}
                          onClick={() => fileInputRef.current?.click()}
                        >
                          {importing ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Upload className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          Importar Excel
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>

                <ProjectProgressHeader value={project.progressPercent} />

                <ProjectBudgetDocumentsPanel
                  project={project}
                  canEdit={canEdit}
                  isAdmin={adminUser}
                  hideConsumed={clientUser}
                  onUpdated={() => void load(true)}
                />

                <section className="space-y-3">
                  <h2 className="text-lg font-semibold">Cronograma (Gantt)</h2>
                  <ProjectGanttChart
                    activities={project.activities}
                    activityNameById={activityNameById}
                  />
                </section>

                <section className="space-y-3">
                  <h2 className="text-lg font-semibold">Atividades</h2>
                  <ProjectActivityTable
                    activities={project.activities}
                    canEdit={canEdit}
                    hideDurations={clientUser}
                    onEdit={openEdit}
                    onAddChild={(row) => openCreate(row.id)}
                    onDelete={(row) => void handleDelete(row)}
                    onToggleDone={(row, done) => void handleToggleDone(row, done)}
                  />
                </section>
              </>
            )}
          </div>

          <ProjectActivityModal
            open={modalOpen}
            onOpenChange={setModalOpen}
            mode={modalMode}
            companyId={companyId}
            allActivities={project?.activities ?? []}
            onSaved={() => void load(true)}
          />
        </AppShell>
      </PermissionGate>
    </ProtectedPage>
  );
}
