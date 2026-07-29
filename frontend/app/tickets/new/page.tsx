"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, FileText, Loader2, Plus, UserRound } from "lucide-react";

import AppShell from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import { ClassificationCascadeFields } from "@/components/tickets/classification-cascade-fields";
import {
  AppointmentDescriptionComposer,
  type AppointmentBlockComposerHandle,
} from "@/components/tickets/appointment-description-composer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelectField } from "@/components/ui/searchable-select-field";
import { Skeleton } from "@/components/ui/skeleton";
import {
  canCreateTicket,
  TICKETS_CREATE_ADMIN_ONLY_MESSAGE,
} from "@/lib/access-control";
import { TICKETS_NEW_SUBTITLE } from "@/lib/module-copy";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  ticketsService,
  type TicketCreateCatalogs,
} from "@/lib/services/tickets.service";

function FormSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-28 w-full" />
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
        <Skeleton className="h-11 w-full" />
      </CardContent>
    </Card>
  );
}

export default function NewTicketPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [catalogs, setCatalogs] = useState<TicketCreateCatalogs | null>(null);

  const [title, setTitle] = useState("");
  const descriptionComposerRef = useRef<AppointmentBlockComposerHandle>(null);
  const [clientId, setClientId] = useState("");
  const [deskId, setDeskId] = useState("");
  const [priorityId, setPriorityId] = useState("");
  const [catalogItemId, setCatalogItemId] = useState("");
  const [classificationId, setClassificationId] = useState<string | null>(
    null,
  );
  const [responsibleId, setResponsibleId] = useState("");
  const [requestorId, setRequestorId] = useState("");
  const [requestorName, setRequestorName] = useState("");
  const [requestorEmail, setRequestorEmail] = useState("");
  const [requestorTelephone, setRequestorTelephone] = useState("");
  const [externalGmudRef, setExternalGmudRef] = useState("");

  const selectedDesk = useMemo(
    () => catalogs?.desks.find((d) => String(d.id) === deskId) ?? null,
    [catalogs, deskId],
  );

  const hasPortalClassification =
    (catalogs?.classification?.tree?.length ?? 0) > 0;

  const requiresCatalog = Boolean(
    catalogs?.desk?.requireServiceCatalog ?? selectedDesk?.requireServiceCatalog,
  );

  const classificationLevelLabels = useMemo(() => {
    const labels: Record<number, string> = {};
    for (const item of catalogs?.classification?.levelLabels ?? []) {
      labels[item.level] = item.label;
    }
    return labels;
  }, [catalogs?.classification?.levelLabels]);

  const clientOptions = useMemo(
    () =>
      (catalogs?.clients ?? []).map((c) => ({
        value: String(c.id),
        label: c.name,
      })),
    [catalogs],
  );

  const deskOptions = useMemo(
    () =>
      (catalogs?.desks ?? []).map((d) => ({
        value: String(d.id),
        label: d.name,
      })),
    [catalogs],
  );

  const catalogItemOptions = useMemo(
    () =>
      (catalogs?.catalogItems ?? []).map((item) => ({
        value: String(item.id),
        label: item.name,
      })),
    [catalogs],
  );

  const priorityOptions = useMemo(
    () =>
      (catalogs?.priorities ?? []).map((p) => ({
        value: String(p.id),
        label: p.name,
      })),
    [catalogs],
  );

  const responsibleOptions = useMemo(
    () =>
      (catalogs?.responsibles ?? []).map((r) => ({
        value: String(r.id),
        label: r.email ? `${r.name} (${r.email})` : r.name,
      })),
    [catalogs],
  );

  const requestorOptions = useMemo(
    () =>
      (catalogs?.requestors ?? []).map((r) => ({
        value: String(r.id),
        label: r.email ? `${r.name} (${r.email})` : r.name,
      })),
    [catalogs],
  );

  const requiresRequestor = Boolean(
    catalogs?.desk?.requiredFields?.requestor_name ||
      catalogs?.desk?.requiredFields?.requestor_email,
  );

  const hasRequestorInfo = Boolean(
    requestorName.trim() || requestorEmail.trim(),
  );

  const catalogBlocked =
    requiresCatalog && deskId !== "" && catalogItemOptions.length === 0;

  const canSubmit =
    !loading &&
    !saving &&
    !catalogBlocked &&
    !(requiresRequestor && !hasRequestorInfo);

  const prevDeskIdRef = useRef("");

  const loadCatalogs = useCallback(
    async (params?: { deskId?: number; clientId?: number }) => {
      try {
        setLoading(true);
        const data = await ticketsService.createCatalogs(params);
        setCatalogs(data);
      } catch (err) {
        notifyError(
          err instanceof Error
            ? err.message
            : "Não foi possível carregar os dados.",
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (deskId !== prevDeskIdRef.current) {
      if (deskId) {
        setPriorityId("");
        setCatalogItemId("");
        setClassificationId(null);
      }
      prevDeskIdRef.current = deskId;
    }

    const parsedDesk = deskId ? Number(deskId) : undefined;
    const parsedClient = clientId ? Number(clientId) : undefined;
    if (deskId && !Number.isFinite(parsedDesk)) return;
    if (clientId && !Number.isFinite(parsedClient)) return;

    void loadCatalogs({
      deskId:
        parsedDesk != null && Number.isFinite(parsedDesk)
          ? parsedDesk
          : undefined,
      clientId:
        parsedClient != null && Number.isFinite(parsedClient)
          ? parsedClient
          : undefined,
    });
  }, [deskId, clientId, loadCatalogs]);

  function handleClientChange(nextClientId: string) {
    setClientId(nextClientId);
    // Solicitante é independente do cliente — não limpa ao trocar a empresa.
    setRequestorId("");
  }

  function handleRequestorSuggestion(nextRequestorId: string) {
    setRequestorId(nextRequestorId);
    if (!nextRequestorId) return;
    const selected = (catalogs?.requestors ?? []).find(
      (row) => String(row.id) === nextRequestorId,
    );
    if (!selected) return;
    setRequestorName(selected.name ?? "");
    setRequestorEmail(selected.email ?? "");
    setRequestorTelephone(selected.telephone ?? "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const content = descriptionComposerRef.current?.exportContent();
    const description = content?.description?.trim() ?? "";
    const files = content?.files ?? [];

    const parsedClient = Number(clientId);
    const parsedDesk = Number(deskId);
    if (
      !title.trim() ||
      !content?.isValid ||
      !Number.isFinite(parsedClient) ||
      !Number.isFinite(parsedDesk)
    ) {
      notifyError("Preencha título, descrição, cliente e mesa.");
      return;
    }

    if (hasPortalClassification && !classificationId) {
      notifyError("Selecione a classificação da mesa.");
      return;
    }

    if (requiresCatalog && !catalogItemId) {
      notifyError("Selecione o serviço do catálogo.");
      return;
    }

    if (!requiresCatalog && !hasPortalClassification && !priorityId) {
      notifyError("Selecione a prioridade.");
      return;
    }

    const requiredFields = catalogs?.desk?.requiredFields ?? {};
    if (
      (requiredFields.requestor_name || requiredFields.requestor_email) &&
      !requestorName.trim() &&
      !requestorEmail.trim()
    ) {
      notifyError("Informe o solicitante (nome ou e-mail).");
      return;
    }

    try {
      setSaving(true);
      const res = await ticketsService.createTicket(
        {
          title: title.trim(),
          description,
          clientId: parsedClient,
          deskId: parsedDesk,
          priorityId: priorityId ? Number(priorityId) : undefined,
          servicesCatalogsItemId: catalogItemId
            ? Number(catalogItemId)
            : undefined,
          classificationId: classificationId ?? undefined,
          responsibleId: responsibleId ? Number(responsibleId) : undefined,
          requestorId: requestorId ? Number(requestorId) : undefined,
          requestorName: requestorName.trim() || undefined,
          requestorEmail: requestorEmail.trim() || undefined,
          requestorTelephone: requestorTelephone.trim() || undefined,
          externalGmudRef: externalGmudRef.trim() || undefined,
        },
        files,
      );
      notifySuccess(res.message);
      router.push(`/tickets/${res.ticketNumber}`);
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível criar o chamado.",
      );
    } finally {
      setSaving(false);
    }
  }

  const canCreate = canCreateTicket();

  return (
    <ProtectedPage>
      <PermissionGate module="TICKETS">
        <AppShell>
          <div className="font-sans w-full space-y-6">
            <PageHeader
              backHref="/tickets"
              backLabel="Voltar à lista"
              icon={<Plus size={24} />}
              title="Novo chamado"
              description={
                canCreate ? TICKETS_NEW_SUBTITLE : TICKETS_CREATE_ADMIN_ONLY_MESSAGE
              }
            />

            {!canCreate ? null : loading && !catalogs ? (
              <FormSkeleton />
            ) : (
              <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <FileText className="size-4 text-primary" />
                      Conteúdo do chamado
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
                      />
                    </div>
                    <AppointmentDescriptionComposer
                      ref={descriptionComposerRef}
                      disabled={saving}
                      labelClassName="text-xs font-semibold text-muted-foreground"
                      placeholder="Detalhe o que precisa ser atendido"
                      hintText="Escreva e cole prints na descrição (Ctrl+V). ZIP/PDF e outros arquivos em Anexos."
                      appendButtonLabel="Anexar arquivo"
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Building2 className="size-4 text-primary" />
                      Cliente e mesa
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-muted-foreground">
                        Cliente
                      </Label>
                      <SearchableSelectField
                        value={clientId}
                        onChange={handleClientChange}
                        options={clientOptions}
                        loading={loading}
                        emptyLabel="Selecione o cliente"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-muted-foreground">
                        Mesa de serviço
                      </Label>
                      <SearchableSelectField
                        value={deskId}
                        onChange={setDeskId}
                        options={deskOptions}
                        loading={loading}
                        emptyLabel="Selecione a mesa"
                      />
                    </div>

                    {deskId && hasPortalClassification ? (
                      <ClassificationCascadeFields
                        serviceDeskId={catalogs?.portalServiceDesk?.id ?? null}
                        tree={catalogs?.classification?.tree ?? null}
                        value={classificationId}
                        onChange={setClassificationId}
                        disabled={loading || saving}
                        levelLabels={classificationLevelLabels}
                      />
                    ) : null}

                    {deskId && requiresCatalog ? (
                      <div className="space-y-2 sm:col-span-2">
                        <Label className="text-xs font-semibold text-muted-foreground">
                          Serviço do catálogo
                        </Label>
                        <SearchableSelectField
                          value={catalogItemId}
                          onChange={setCatalogItemId}
                          options={catalogItemOptions}
                          loading={loading}
                          emptyLabel={
                            catalogItemOptions.length === 0
                              ? "Nenhum serviço cadastrado no catálogo desta mesa"
                              : "Selecione o serviço"
                          }
                        />
                        {catalogBlocked ? (
                          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/90">
                            Esta mesa exige catálogo de serviços, mas não há itens
                            cadastrados. Cadastre serviços na mesa{" "}
                            <strong>{catalogs?.desk?.name ?? "selecionada"}</strong>{" "}
                            antes de abrir chamados.
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    {deskId && !requiresCatalog && !hasPortalClassification ? (
                      <div className="space-y-2 sm:col-span-2">
                        <Label className="text-xs font-semibold text-muted-foreground">
                          Prioridade
                        </Label>
                        <SearchableSelectField
                          value={priorityId}
                          onChange={setPriorityId}
                          options={priorityOptions}
                          loading={loading}
                          emptyLabel="Selecione a prioridade"
                        />
                      </div>
                    ) : null}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <UserRound className="size-4 text-primary" />
                      Responsável e solicitante
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-muted-foreground">
                        Responsável
                      </Label>
                      <SearchableSelectField
                        value={responsibleId}
                        onChange={setResponsibleId}
                        options={responsibleOptions}
                        loading={loading}
                        emptyLabel={
                          responsibleOptions.length === 0
                            ? "Nenhum atendente encontrado"
                            : "Selecione o responsável"
                        }
                        placeholder="Selecione o responsável"
                      />
                    </div>
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold text-muted-foreground">
                          Solicitante
                        </Label>
                        <Input
                          value={requestorName}
                          onChange={(e) => {
                            setRequestorName(e.target.value);
                            setRequestorId("");
                          }}
                          placeholder="Nome de quem está solicitando"
                          className="h-11"
                          disabled={saving}
                        />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold text-muted-foreground">
                            E-mail do solicitante
                          </Label>
                          <Input
                            type="email"
                            value={requestorEmail}
                            onChange={(e) => {
                              setRequestorEmail(e.target.value);
                              setRequestorId("");
                            }}
                            placeholder="email@empresa.com"
                            className="h-11"
                            disabled={saving}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold text-muted-foreground">
                            Telefone (opcional)
                          </Label>
                          <Input
                            value={requestorTelephone}
                            onChange={(e) => {
                              setRequestorTelephone(e.target.value);
                              setRequestorId("");
                            }}
                            placeholder="(00) 00000-0000"
                            className="h-11"
                            disabled={saving}
                          />
                        </div>
                      </div>
                      {requestorOptions.length > 0 ? (
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold text-muted-foreground">
                            Preencher do cadastro do cliente (opcional)
                          </Label>
                          <SearchableSelectField
                            value={requestorId}
                            onChange={handleRequestorSuggestion}
                            options={requestorOptions}
                            loading={loading}
                            emptyLabel="Escolher contato do cliente"
                            placeholder="Escolher contato do cliente"
                          />
                        </div>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        Pode ser de outra empresa — o solicitante não precisa
                        ser do cliente do chamado.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-muted-foreground">
                        Referência GMUD do cliente (opcional)
                      </Label>
                      <Input
                        value={externalGmudRef}
                        onChange={(e) => setExternalGmudRef(e.target.value)}
                        placeholder="Ex.: GMUD-2024-001 ou número interno do cliente"
                        className="h-11"
                      />
                      <p className="text-xs text-muted-foreground">
                        Código ou identificador da GMUD no sistema do cliente — não é a GMUD cadastrada no Alle.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Button type="submit" size="lg" disabled={!canSubmit}>
                  {saving ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : null}
                  Abrir chamado
                </Button>
              </form>
            )}
          </div>
        </AppShell>
      </PermissionGate>
    </ProtectedPage>
  );
}
