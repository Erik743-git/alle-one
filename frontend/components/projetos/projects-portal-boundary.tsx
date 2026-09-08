"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CalendarRange, FolderKanban } from "lucide-react";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import AppShell from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { ProjectActivityTable, ProjectGanttChart, ProjectProgressHeader } from "@/components/projetos/project-gantt-parts";
import { useAuth } from "@/lib/use-auth";
import { isClientPortalRole } from "@/lib/app-roles";
import { ProjectIssuesPanel } from "@/components/projetos/project-issues-panel";
import { useProjectIssues } from "@/lib/use-project-issues";
import { flattenProjectActivities } from "@/lib/services/projetos.service";
import { issueActivities } from "@/lib/project-issues";
import { getClientProjectsMock } from "@/lib/projetos-client-mock";

/** Wait for session restoration before mounting either data source. */
export function ProjectsPortalBoundary({ children }: { children: ReactNode }) {
  const { user, loading, authenticated } = useAuth();
  return <ProtectedPage><PermissionGate module="PROJECTS">
    {!loading && authenticated && user ? isClientPortalRole(user.role)
      ? <ClientProjects key={`${user.id}:${user.companyId}`} /> : children : null}
  </PermissionGate></ProtectedPage>;
}

function ClientProjects() {
  const { user } = useAuth();
  const params = useParams<{ companyId?: string; projectId?: string }>();
  const data = useMemo(() => getClientProjectsMock(user, params.companyId, params.projectId), [user, params.companyId, params.projectId]);
  return data ? <ClientProjectsWorkspace key={`${user!.id}:${data.companyId}`} data={data} /> : <AppShell><div className="space-y-4 py-12 text-center"><p>{!user?.companyId ? "Nenhuma empresa vinculada ao seu usuário." : "Projeto ou empresa indisponível para o seu usuário."}</p><Link href="/projetos" className="text-primary underline">Voltar aos projetos</Link></div></AppShell>;
}

function ClientProjectsWorkspace({ data: seed }: { data: NonNullable<ReturnType<typeof getClientProjectsMock>> }) {
  const [tab, setTab] = useState<"schedule" | "planning">("schedule");
  const issues = useProjectIssues(seed.companyId, seed.projects);
  const projects = seed.projects.map((item) => {
    const activities = issueActivities(issues.state.issues, item.id, issues.state.columns);
    const flat = flattenProjectActivities(activities);
    const progress = flat.length ? Math.round(flat.reduce((sum, a) => sum + a.progressPercent, 0) / flat.length) : 0;
    return { ...item, activities, progress, status: progress === 100 ? "Concluído" : progress > 0 ? "Em andamento" : "Planejamento" };
  });
  const data = { ...seed, projects, project: projects.find((item) => item.id === seed.project?.id) };
  const project = data?.project;
  const noAction = () => {};

  return <AppShell><div className="w-full space-y-6 font-sans">
    <div>
      <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><FolderKanban className="h-7 w-7 text-primary" />Projetos</h1>
      <p className="mt-1 text-sm text-muted-foreground">Cronogramas e demandas da sua empresa.</p>
      <p className="mt-2 text-xs text-muted-foreground">Demonstração · alterações salvas neste navegador, sem sincronização com o servidor.</p>
    </div>
    <>
      <div className="inline-flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1" aria-label="Áreas de projetos">
        <Button aria-pressed={tab === "schedule"} variant={tab === "schedule" ? "default" : "ghost"} onClick={() => setTab("schedule")}><CalendarRange className="mr-2 h-4 w-4" />Cronogramas</Button>
        <Button aria-pressed={tab === "planning"} variant={tab === "planning" ? "default" : "ghost"} onClick={() => setTab("planning")}><FolderKanban className="mr-2 h-4 w-4" />Demandas</Button>
      </div>
      {tab === "planning" ? <ProjectIssuesPanel state={issues.state} projects={seed.projects} initialProjectId={seed.project?.id} onSave={issues.save} onDelete={issues.remove} onColumnSave={issues.saveColumn} onImport={issues.importData} onSaveTemplate={issues.saveTemplate} onDeleteTemplate={issues.deleteTemplate} onImportTemplates={issues.importModels} /> : project ? <div className="space-y-5">
        <Link href={`/projetos/${encodeURIComponent(data.companyId)}`} className="inline-flex items-center text-sm text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft className="mr-1 h-4 w-4" />Cronogramas</Link>
        <div><p className="text-xs text-muted-foreground">#{project.code} · {project.status}</p><h2 className="text-xl font-semibold">{project.name}</h2></div>
        <ProjectProgressHeader value={project.progress} />
        <ProjectActivityTable activities={project.activities} canEdit={false} hideDurations onEdit={noAction} onAddChild={noAction} onDelete={noAction} onToggleDone={noAction} />
        <ProjectGanttChart activities={project.activities} activityNameById={new Map(flattenProjectActivities(project.activities).map((item) => [item.id, item.name]))} />
      </div> : <div className="grid gap-4">
        {data.projects.map((item) => <Link key={item.id} href={`/projetos/${encodeURIComponent(data.companyId)}/${encodeURIComponent(item.id)}`} className="block space-y-3 rounded-xl border bg-card p-5 transition hover:border-primary/40 hover:bg-accent/20">
          <p className="text-xs text-muted-foreground">#{item.code} · {item.status}</p>
          <h2 className="text-lg font-semibold">{item.name}</h2>
          <p className="text-sm text-muted-foreground">{flattenProjectActivities(item.activities).length} atividades</p>
          <ProjectProgressHeader value={item.progress} />
        </Link>)}
      </div>}
    </>
  </div></AppShell>;
}
