"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Download,
  FolderKanban,
  Loader2,
  RefreshCw,
} from "lucide-react";

import AppShell from "@/components/layout/app-shell";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ProjectCreateCard } from "@/components/projetos/project-create-card";
import {
  canEditProjetos,
  isClient,
} from "@/lib/access-control";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  PROJECT_STATUS_LABELS,
  projetosService,
  type ProjectSummary,
} from "@/lib/services/projetos.service";

function ProgressBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function ProjetosCompanyPage() {
  const params = useParams<{ companyId: string }>();
  const router = useRouter();
  const companyId = params.companyId;
  const canEdit = canEditProjetos();
  const clientUser = isClient();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);

  const load = useCallback(async (silent = false) => {
    if (!companyId) return;
    try {
      if (silent) setRefreshing(true);
      else setLoading(true);
      const data = await projetosService.listProjects(companyId);
      setCompanyName(data.company.name);
      setProjects(data.projects);
    } catch (err) {
      // Link legado /projetos/:projectId (sem companyId na URL)
      try {
        const project = await projetosService.getProject(companyId);
        router.replace(`/projetos/${project.companyId}/${project.id}`);
        return;
      } catch {
        notifyError(
          err instanceof Error ? err.message : "Não foi possível carregar os projetos.",
        );
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [companyId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const sorted = useMemo(
    () => [...projects].sort((a, b) => b.code - a.code),
    [projects],
  );

  async function handleExportTemplate() {
    try {
      await projetosService.downloadImportTemplate();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Falha ao exportar modelo.");
    }
  }

  return (
    <ProtectedPage>
      <PermissionGate module="PROJECTS">
        <AppShell>
          <div className="font-sans w-full space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                {!clientUser ? (
                  <Link
                    href="/projetos"
                    className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="mr-1 h-4 w-4" />
                    Empresas
                  </Link>
                ) : null}
                <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
                  <FolderKanban className="h-7 w-7 text-primary" />
                  {companyName || "Projetos"}
                </h1>
                <p className="text-sm text-muted-foreground">
                  Cronogramas, atividades e exportação para Excel.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={loading || refreshing}
                  onClick={() => void load(true)}
                >
                  <RefreshCw
                    className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                  />
                  Atualizar
                </Button>
                <Button type="button" variant="outline" onClick={() => void handleExportTemplate()}>
                  <Download className="mr-2 h-4 w-4" />
                  Modelo Excel
                </Button>
              </div>
            </div>

            {canEdit ? (
              <ProjectCreateCard
                companyId={companyId}
                onCreated={(projectId) => {
                  notifySuccess("Projeto criado.");
                  router.push(`/projetos/${companyId}/${projectId}`);
                }}
              />
            ) : null}

            {loading ? (
              <div className="flex items-center justify-center py-20 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                Carregando...
              </div>
            ) : sorted.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  Nenhum projeto cadastrado para esta empresa.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {sorted.map((project) => (
                  <Link
                    key={project.id}
                    href={`/projetos/${companyId}/${project.id}`}
                    className="block rounded-xl border bg-card p-5 transition hover:border-primary/40 hover:bg-accent/20"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          #{project.code} · {PROJECT_STATUS_LABELS[project.status]}
                        </p>
                        <h2 className="text-lg font-semibold truncate">{project.name}</h2>
                        <p className="text-sm text-muted-foreground">
                          {project.activitiesCount}{" "}
                          {project.activitiesCount === 1 ? "atividade" : "atividades"}
                          {project.startDate || project.endDate
                            ? ` · ${project.startDate ?? "—"} → ${project.endDate ?? "—"}`
                            : ""}
                        </p>
                      </div>
                      <div className="w-full sm:w-56 space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Andamento</span>
                          <span className="font-semibold">{project.progressPercent}%</span>
                        </div>
                        <ProgressBar value={project.progressPercent} />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </AppShell>
      </PermissionGate>
    </ProtectedPage>
  );
}
