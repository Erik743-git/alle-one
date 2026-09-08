import type { AuthUser } from "@/lib/session";
import { isClientPortalRole } from "@/lib/app-roles";
import type { ProjectActivity } from "@/lib/services/projetos.service";

/** Mock client-only: the active session company is the same scope used by Inventory.
 * Never use a company from the URL to generate data. API authorization must be
 * enforced on the server when this demonstration is connected to real data. */
export function getClientProjectsMock(user: AuthUser | null, companyId?: string, projectId?: string) {
  if (!user || !isClientPortalRole(user.role) || !user.companyId) return null;
  if (companyId && companyId !== user.companyId) return null;
  const projects = [
    { key: "infraestrutura", name: "Modernização da infraestrutura", progress: 50, status: "Em andamento" },
    { key: "ambiente-digital", name: "Evolução do portal de serviços", progress: 0, status: "Planejamento" },
    { key: "rede", name: "Experiência do cliente e operações", progress: 100, status: "Concluído" },
  ].map((item, index) => {
    const id = `demo-${encodeURIComponent(user.companyId!)}-${item.key}`;
    const activities: ProjectActivity[] = ["Levantamento inicial", "Execução", "Validação e entrega"].map((name, step) => {
      const progressPercent = item.progress === 100 ? 100 : item.progress === 0 ? 0 : [100, 50, 0][step];
      return {
        id: `${id}-${step}`, projectId: id, parentId: null, wbsCode: `${step + 1}`,
        name, kind: "TASK", level: 1, sortOrder: step, durationDays: 5, durationHours: 40,
        startDate: `2026-09-${String(1 + step * 7).padStart(2, "0")}`,
        endDate: `2026-09-${String(5 + step * 7).padStart(2, "0")}`,
        actualDurationDays: null, actualDurationHours: null, progressPercent,
        activityStatus: progressPercent === 100 ? "COMPLETED" : progressPercent > 0 ? "IN_PROGRESS" : "NOT_STARTED",
        completedAt: null, assigneeUserId: null, assigneeName: "Equipe de demonstração",
        assigneeDisplayName: "Equipe de demonstração", isMilestone: false, notes: null,
        predecessorIds: [], predecessors: [], predecessorsComplete: true, canStart: true,
        appointments: [], children: [],
      };
    });
    return { ...item, id, companyId: user.companyId!, code: index + 1, activities };
  });
  const project = projectId ? projects.find((item) => item.id === projectId) : undefined;
  if (projectId && !project) return null;
  return { companyId: user.companyId, projects, project };
}
