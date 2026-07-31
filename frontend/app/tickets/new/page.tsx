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
import { FieldLabel } from "@/components/ui/field-label";
import { Input } from "@/components/ui/input";
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

  const requiresPriority =
    Boolean(deskId) && !requiresCatalog && !hasPortalClassification;

  const missingRequired = useMemo(() => {
    const missing: string[] = [];
    if (!title.trim()) missing.push("Título");
    if (!clientId) missing.push("Cliente");
    if (!deskId) missing.push("Mesa de serviço");
    if (deskId && hasPortalClassification && !classificationId) {
      missing.push("Classificação");
    }
    if (deskId && requiresCatalog && !catalogBlocked && !catalogItemId) {
      missing.push("Serviço do catálogo");
    }
    if (requiresPriority && !priorityId) missing.push("Prioridade");
    if (requiresRequestor && !hasRequestorInfo) {
      missing.push("Solicitante (nome ou e-mail)");
    }
    return missing;
  }, [
    title,
    clientId,
    deskId,
    hasPortalClassification,
    classificationId,
    requiresCatalog,
    catalogBlocked,
    catalogItemId,
    requiresPriority,
    priorityId,
    requiresRequestor,
    hasRequestorInfo,
  ]);

  const canSubmit =
    !loading &&
    !saving &&
    !catalogBlocked &&
    missingRequired.length === 0;

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
                      <FieldLabel required>Título</FieldLabel>
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
                      hintText="Escreva e cole prints na descrição (Ctrl+V). ZIP/PDF e outros arquivos em Anexos. Campo obrigatório."
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
                      <FieldLabel required>Cliente</FieldLabel>
                      <SearchableSelectField
                        value={clientId}
                        onChange={handleClientChange}
                        options={clientOptions}
                        loading={loading}
                        emptyLabel="Selecione o cliente"
                      />
                    </div>
                    <div className="space-y-2">
                      <FieldLabel required>Mesa de serviço</FieldLabel>
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
                        required
                        levelLabels={classificationLevelLabels}
                      />
                    ) : null}

                    {deskId && requiresCatalog ? (
                      <div className="space-y-2 sm:col-span-2">
                        <FieldLabel required>Serviço do catálogo</FieldLabel>
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

                    {deskId && requiresPriority ? (
                      <div className="space-y-2 sm:col-span-2">
                        <FieldLabel required>Prioridade</FieldLabel>
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
                      <FieldLabel optional>Responsável</FieldLabel>
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
                      {requestorOptions.length > 0 ? (
                        <div className="space-y-2">
                          <FieldLabel optional>
                            Preencher do cadastro do cliente
                          </FieldLabel>
                          <SearchableSelectField
                            value={requestorId}
                            onChange={handleRequestorSuggestion}
                            options={requestorOptions}
                            loading={loading}
                            emptyLabel="Escolher contato do cliente"
                            placeholder="Escolher contato do cliente"
                          />
                          <p className="text-xs text-muted-foreground">
                            Sugestões do cliente selecionado (sem duplicar e-mail).
                            Para Alle Tecnologia/Infra, só aparecem endereços @alletecnologia.com.
                            Preenche nome, e-mail e telefone abaixo.
                          </p>
                        </div>
                      ) : null}
                      <div className="space-y-2">
                        <FieldLabel required={requiresRequestor} optional={!requiresRequestor}>
                          Solicitante
                        </FieldLabel>
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
                          <FieldLabel
                            required={requiresRequestor}
                            optional={!requiresRequestor}
                          >
                            E-mail do solicitante
                          </FieldLabel>
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
                          <FieldLabel optional>Telefone</FieldLabel>
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
                      {requiresRequestor ? (
                        <p className="text-xs text-muted-foreground">
                          Esta mesa exige solicitante: informe <strong>nome ou e-mail</strong>.
                        </p>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        Você também pode digitar nome/e-mail manualmente — o solicitante
                        não precisa estar na lista.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <FieldLabel optional>
                        Referência GMUD do cliente
                      </FieldLabel>
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

                <div className="space-y-3">
                  {!canSubmit && !loading && !saving ? (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-50/95">
                      {catalogBlocked ? (
                        <p>
                          Não é possível abrir o chamado: a mesa exige catálogo, mas
                          não há serviços cadastrados.
                        </p>
                      ) : missingRequired.length > 0 ? (
                        <>
                          <p className="font-semibold">
                            Preencha os campos obrigatórios para habilitar Abrir chamado:
                          </p>
                          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm">
                            {missingRequired.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                          <p className="mt-2 text-xs text-amber-100/80">
                            Campos com <span className="text-destructive">*</span> são
                            obrigatórios. A descrição também é obrigatória.
                          </p>
                        </>
                      ) : null}
                    </div>
                  ) : null}

                  <Button type="submit" size="lg" disabled={!canSubmit}>
                    {saving ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : null}
                    Abrir chamado
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
