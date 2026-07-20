"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Clock, Link2, Loader2, Plus, Unlink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SearchableSelectField } from "@/components/ui/searchable-select-field";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  flattenProjectActivities,
  projetosService,
  type ProjectActivity,
  type ProjectTicketAppointment,
} from "@/lib/services/projetos.service";

function formatApptDate(value: string): string {
  const d = parseISO(value);
  return Number.isNaN(d.getTime()) ? value : format(d, "dd/MM/yyyy", { locale: ptBR });
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}

function linkableActivities(activities: ProjectActivity[]) {
  return flattenProjectActivities(activities).filter((row) => {
    const kind =
      row.kind ??
      (row.level === 1 && !row.parentId
        ? "PHASE"
        : row.isMilestone
          ? "MILESTONE"
          : "TASK");
    return kind !== "PHASE";
  });
}

type Props = {
  projectId: string;
  ticketNumber: number | null;
  activities: ProjectActivity[];
  canEdit: boolean;
  onUpdated: () => void;
  onCreateAppointment: (activityId?: string) => void;
};

export function ProjectTicketAppointmentsPanel({
  projectId,
  ticketNumber,
  activities,
  canEdit,
  onUpdated,
  onCreateAppointment,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);
  const [appointments, setAppointments] = useState<ProjectTicketAppointment[]>([]);
  const [linkTargetByAppt, setLinkTargetByAppt] = useState<Record<string, string>>({});

  const activityOptions = useMemo(
    () =>
      linkableActivities(activities).map((row) => ({
        value: row.id,
        label: `${row.wbsCode} — ${row.name}`,
      })),
    [activities],
  );

  const load = useCallback(async () => {
    if (!projectId || !ticketNumber) {
      setAppointments([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await projetosService.listProjectTicketAppointments(projectId);
      setAppointments(data.appointments);
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível carregar apontamentos.",
      );
    } finally {
      setLoading(false);
    }
  }, [projectId, ticketNumber]);

  useEffect(() => {
    void load();
  }, [load]);

  const unlinked = appointments.filter((row) => !row.linkedActivityId);
  const linked = appointments.filter((row) => row.linkedActivityId);

  async function handleLink(row: ProjectTicketAppointment) {
    const activityId = linkTargetByAppt[row.portalAppointmentId];
    if (!activityId) {
      notifyError("Selecione a atividade para vincular.");
      return;
    }
    try {
      setLinkingId(row.portalAppointmentId);
      await projetosService.linkActivityAppointment(activityId, row.portalAppointmentId);
      notifySuccess("Apontamento vinculado.");
      onUpdated();
      await load();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Falha ao vincular.");
    } finally {
      setLinkingId(null);
    }
  }

  async function handleUnlink(row: ProjectTicketAppointment) {
    if (!row.linkId) return;
    try {
      setUnlinkingId(row.linkId);
      await projetosService.unlinkActivityAppointment(row.linkId);
      notifySuccess("Apontamento desvinculado.");
      onUpdated();
      await load();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Falha ao desvincular.");
    } finally {
      setUnlinkingId(null);
    }
  }

  if (!ticketNumber) {
    return (
      <section className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
        Este projeto não possui ticket vinculado. Apontamentos do cronograma exigem um
        ticket associado.
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-xl border bg-card p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Apontamentos do ticket #{ticketNumber}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Vincule apontamentos existentes ou crie novos — o tempo abate na atividade e
            atualiza o cronograma.
          </p>
        </div>
        {canEdit ? (
          <Button type="button" size="sm" onClick={() => onCreateAppointment()}>
            <Plus className="mr-1.5 h-4 w-4" />
            Novo apontamento
          </Button>
        ) : null}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Carregando apontamentos...
        </div>
      ) : appointments.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">
          Nenhum apontamento no ticket ainda.
          {canEdit ? " Use &quot;Novo apontamento&quot; para registrar tempo." : ""}
        </p>
      ) : (
        <div className="space-y-6">
          {unlinked.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">
                Sem vínculo ({unlinked.length})
              </h3>
              <div className="divide-y rounded-lg border overflow-hidden">
                {unlinked.map((row) => (
                  <div
                    key={row.portalAppointmentId}
                    className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between bg-muted/20"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-medium">
                        {formatApptDate(row.appointmentDate)} · {row.initTime}–{row.endTime}
                        <span className="ml-2 text-muted-foreground font-normal">
                          ({formatMinutes(row.minutes)})
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">{row.authorName}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {row.description || "—"}
                      </p>
                    </div>
                    {canEdit ? (
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:shrink-0">
                        <SearchableSelectField
                          modal
                          value={linkTargetByAppt[row.portalAppointmentId] ?? ""}
                          onChange={(value) =>
                            setLinkTargetByAppt((prev) => ({
                              ...prev,
                              [row.portalAppointmentId]: value,
                            }))
                          }
                          options={activityOptions}
                          placeholder="Atividade..."
                          emptyLabel="Sem atividades"
                          preserveOrder
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={linkingId === row.portalAppointmentId}
                          onClick={() => void handleLink(row)}
                        >
                          {linkingId === row.portalAppointmentId ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Link2 className="mr-1 h-4 w-4" />
                          )}
                          Vincular
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {linked.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">
                Vinculados ao cronograma ({linked.length})
              </h3>
              <div className="divide-y rounded-lg border overflow-hidden">
                {linked.map((row) => (
                  <div
                    key={row.portalAppointmentId}
                    className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-medium">
                        {formatApptDate(row.appointmentDate)} · {row.initTime}–{row.endTime}
                        <span className="ml-2 text-muted-foreground font-normal">
                          ({formatMinutes(row.minutes)})
                        </span>
                      </p>
                      <p className="text-xs text-primary font-medium">
                        → {row.linkedActivityLabel}
                      </p>
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {row.description || "—"}
                      </p>
                    </div>
                    {canEdit ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="shrink-0 text-muted-foreground hover:text-rose-500"
                        disabled={unlinkingId === row.linkId}
                        onClick={() => void handleUnlink(row)}
                      >
                        {unlinkingId === row.linkId ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Unlink className="mr-1 h-4 w-4" />
                        )}
                        Desvincular
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
