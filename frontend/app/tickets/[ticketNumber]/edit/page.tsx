"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { FileText, Loader2, Pencil, Tags, UserRound } from "lucide-react";

import AppShell from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import {
  AppointmentDescriptionComposer,
  type AppointmentBlockComposerHandle,
} from "@/components/tickets/appointment-description-composer";
import { ClassificationCascadeFields } from "@/components/tickets/classification-cascade-fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelectField } from "@/components/ui/searchable-select-field";
import { Skeleton } from "@/components/ui/skeleton";
import {
  canChangeTicketStage,
  TICKETS_CREATE_ADMIN_ONLY_MESSAGE,
} from "@/lib/access-control";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  ticketsService,
  type TicketCreateCatalogs,
  type TicketDetailResponse,
  type TicketStagesResponse,
} from "@/lib/services/tickets.service";

function FormSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-40 w-full" />
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function EditTicketPage() {
  const params = useParams<{ ticketNumber: string }>();
  const router = useRouter();
  const ticketNumber = Number(params.ticketNumber);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<TicketDetailResponse | null>(null);
  const [stages, setStages] = useState<TicketStagesResponse | null>(null);
  const [catalogs, setCatalogs] = useState<TicketCreateCatalogs | null>(null);
  const [title, setTitle] = useState("");
  const [stageId, setStageId] = useState("");
  const [responsibleId, setResponsibleId] = useState("");
  const [classificationId, setClassificationId] = useState<string | null>(null);
  const [responsibles, setResponsibles] = useState<
    Array<{ externalId: number; name: string; email: string | null }>
  >([]);
  const descriptionComposerRef = useRef<AppointmentBlockComposerHandle>(null);
  const [composerKey, setComposerKey] = useState(0);

  const hasPortalClassification =
    (catalogs?.classification?.tree?.length ?? 0) > 0;

  const classificationLevelLabels = useMemo(() => {
    const map: Record<number, string> = {};
    for (const item of catalogs?.classification?.levelLabels ?? []) {
      map[item.level] = item.label;
    }
    return map;
  }, [catalogs?.classification?.levelLabels]);

  const load = useCallback(async () => {
    if (!Number.isFinite(ticketNumber)) return;
    setLoading(true);
    try {
      const ticketDetail = await ticketsService.detail(ticketNumber);
      const deskId = ticketDetail.ticket.deskExternalId ?? undefined;
      const [stagesRes, deskCatalogs, filterCatalogs] = await Promise.all([
        ticketsService.listStages(ticketNumber).catch(() => null),
        deskId
          ? ticketsService.createCatalogs({ deskId }).catch(() => null)
          : Promise.resolve(null),
        ticketsService.catalogs().catch(() => null),
      ]);
      setDetail(ticketDetail);
      setStages(stagesRes);
      setCatalogs(deskCatalogs);
      setTitle(ticketDetail.ticket.title ?? "");
      setClassificationId(ticketDetail.classificationId ?? null);
      setStageId(
        stagesRes?.currentStageId != null
          ? String(stagesRes.currentStageId)
          : "",
      );
      const list = filterCatalogs?.responsibles ?? [];
      setResponsibles(list);
      const matched = list.find(
        (r) =>
          r.name.trim().toLowerCase() ===
          (ticketDetail.ticket.responsibleName ?? "").trim().toLowerCase(),
      );
      setResponsibleId(matched ? String(matched.externalId) : "");
      setComposerKey((k) => k + 1);
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível carregar o ticket.",
      );
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [ticketNumber]);

  useEffect(() => {
    void load();
  }, [load]);

  const stageOptions = useMemo(
    () =>
      (stages?.stages ?? []).map((stage) => ({
        value: String(stage.id),
        label: stage.firstStage ? `${stage.name} (inicial)` : stage.name,
      })),
    [stages],
  );

  const responsibleOptions = useMemo(
    () =>
      responsibles.map((r) => ({
        value: String(r.externalId),
        label: r.email ? `${r.name} (${r.email})` : r.name,
      })),
    [responsibles],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!detail) return;

    const content = descriptionComposerRef.current?.exportContent();
    const description = content?.description?.trim() ?? "";
    const files = content?.files ?? [];

    if (title.trim().length < 2) {
      notifyError("Informe um título válido.");
      return;
    }
    if (!content?.isValid) {
      notifyError("Informe a descrição do ticket (texto e/ou imagens).");
      return;
    }
    if (hasPortalClassification && !classificationId) {
      notifyError("Selecione a classificação do catálogo.");
      return;
    }

    const selectedStage = (stages?.stages ?? []).find(
      (s) => String(s.id) === stageId,
    );
    const selectedResponsible = responsibles.find(
      (r) => String(r.externalId) === responsibleId,
    );

    try {
      setSaving(true);
      const res = await ticketsService.updateTicket(
        ticketNumber,
        {
          title: title.trim(),
          description,
          stageName: selectedStage?.name,
          classificationId: hasPortalClassification ? classificationId : undefined,
          removeAttachmentFileIds: content.removeAttachmentFileIds,
          ...(responsibleId !== "" && selectedResponsible
            ? {
                responsibleId: selectedResponsible.externalId,
                responsibleName: selectedResponsible.name,
              }
            : responsibleId === ""
              ? {
                  responsibleId: null,
                  responsibleName: null,
                }
              : {}),
        },
        files,
      );
      notifySuccess(res.message);
      router.push(`/tickets/${ticketNumber}`);
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível salvar o ticket.",
      );
    } finally {
      setSaving(false);
    }
  }

  const canEdit = canChangeTicketStage();
  const closed = Boolean(detail?.ticket.isClosed);

  return (
    <ProtectedPage>
      <PermissionGate module="TICKETS">
        <AppShell>
          <div className="font-sans w-full space-y-6">
            <PageHeader
              backHref={
                Number.isFinite(ticketNumber)
                  ? `/tickets/${ticketNumber}`
                  : "/tickets"
              }
              backLabel="Voltar ao ticket"
              icon={<Pencil size={24} />}
              title={
                Number.isFinite(ticketNumber)
                  ? `Editar ticket #${ticketNumber}`
                  : "Editar ticket"
              }
              description={
                canEdit
                  ? "Atualize título, descrição (com imagens), classificação, estágio e responsável."
                  : TICKETS_CREATE_ADMIN_ONLY_MESSAGE
              }
            />

            {!canEdit ? null : loading || !detail ? (
              <FormSkeleton />
            ) : (
              <form
                onSubmit={(e) => void handleSubmit(e)}
                className="space-y-6"
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <FileText className="size-4 text-primary" />
                      Conteúdo do ticket
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-muted-foreground">
                        Título
                      </Label>
                      <Input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Resumo do problema ou solicitação"
                        className="h-11"
                        required
                        disabled={saving || closed}
                      />
                    </div>
                    <AppointmentDescriptionComposer
                      key={composerKey}
                      ref={descriptionComposerRef}
                      disabled={saving || closed}
                      labelClassName="text-xs font-semibold text-muted-foreground"
                      placeholder="Detalhe o que precisa ser atendido"
                      hintText="Escreva e cole prints na descrição (Ctrl+V). ZIP/PDF e outros arquivos em Anexos."
                      appendButtonLabel="Anexar arquivo"
                      initialDescription={
                        detail.portalDescription?.description ?? null
                      }
                      initialAttachments={
                        detail.portalDescription?.attachments ?? []
                      }
                    />
                  </CardContent>
                </Card>

                {hasPortalClassification ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Tags className="size-4 text-primary" />
                        Classificação
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ClassificationCascadeFields
                        serviceDeskId={catalogs?.portalServiceDesk?.id ?? null}
                        tree={catalogs?.classification?.tree ?? null}
                        value={classificationId}
                        onChange={setClassificationId}
                        disabled={loading || saving || closed}
                        required
                        levelLabels={classificationLevelLabels}
                      />
                    </CardContent>
                  </Card>
                ) : null}

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <UserRound className="size-4 text-primary" />
                      Estágio e responsável
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-muted-foreground">
                        Estágio
                      </Label>
                      <SearchableSelectField
                        value={stageId}
                        onChange={setStageId}
                        options={stageOptions}
                        disabled={saving || closed || stageOptions.length === 0}
                        placeholder="Selecione o estágio"
                        preserveOrder
                      />
                      <p className="text-xs text-muted-foreground">
                        Estágios como Plantão podem ser cadastrados em Admin →
                        Ticket.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-muted-foreground">
                        Responsável
                      </Label>
                      <SearchableSelectField
                        value={responsibleId}
                        onChange={setResponsibleId}
                        options={responsibleOptions}
                        disabled={saving || closed}
                        placeholder="Selecione o responsável (opcional)"
                        emptyLabel="Sem responsável"
                        preserveOrder
                      />
                      {responsibleId ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-2"
                          disabled={saving || closed}
                          onClick={() => setResponsibleId("")}
                        >
                          Remover responsável
                        </Button>
                      ) : (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Se remover o responsável, o ticket será convertido em
                          pré-ticket e todas as informações serão preservadas.
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {closed ? (
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    Ticket fechado — reabra antes de editar.
                  </p>
                ) : null}

                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving}
                    onClick={() => router.push(`/tickets/${ticketNumber}`)}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={saving || closed}>
                    {saving ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : null}
                    Salvar alterações
                  </Button>
                </div>
              </form>
            )}
          </div>
        </AppShell>
      </PermissionGate>
    </ProtectedPage>
  );
}
