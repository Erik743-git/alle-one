"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, FileText, Loader2, Plus, UserRound, X } from "lucide-react";

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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldLabel } from "@/components/ui/field-label";
import { Input } from "@/components/ui/input";
import { SearchableSelectField } from "@/components/ui/searchable-select-field";
import { Skeleton } from "@/components/ui/skeleton";
import {
  canCreateTicket,
  TICKETS_CREATE_ADMIN_ONLY_MESSAGE,
} from "@/lib/access-control";
import { isClientPortalRole } from "@/lib/app-roles";
import { useAuth } from "@/lib/use-auth";
import { TICKETS_NEW_SUBTITLE } from "@/lib/module-copy";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  applyClientTitlePrefix,
  emailsMatch,
  findByEmail,
  formatBrPhone,
  isValidBrPhone,
  pinCurrentUserFirst,
} from "@/lib/ticket-form";
import {
  ticketsService,
  type TicketCreateCatalogs,
} from "@/lib/services/tickets.service";
import { gmudsService, type Gmud } from "@/lib/services/gmuds.service";

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
  const { user } = useAuth();
  const isClientUser = isClientPortalRole(user?.role);
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
  const [newRequestorOpen, setNewRequestorOpen] = useState(false);
  const [newRequestorName, setNewRequestorName] = useState("");
  const [newRequestorEmail, setNewRequestorEmail] = useState("");
  const [newRequestorTelephone, setNewRequestorTelephone] = useState("");
  const [externalGmudRef, setExternalGmudRef] = useState("");
  const [gmudOptions, setGmudOptions] = useState<Gmud[]>([]);
  const [loadingGmuds, setLoadingGmuds] = useState(false);
  const [ccPeople, setCcPeople] = useState<
    Array<{ email: string; name?: string }>
  >([]);
  const [ccSelectValue, setCcSelectValue] = useState("");

  const selectedDesk = useMemo(
    () => catalogs?.desks.find((d) => String(d.id) === deskId) ?? null,
    [catalogs, deskId],
  );

  const selectedClient = useMemo(
    () => catalogs?.clients.find((c) => String(c.id) === clientId) ?? null,
    [catalogs, clientId],
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

  const responsibleOptions = useMemo(() => {
    const sorted = [...(catalogs?.responsibles ?? [])].sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR"),
    );
    return pinCurrentUserFirst(sorted, user?.email).map((r) => {
      const label = r.email ? `${r.name} (${r.email})` : r.name;
      return {
        value: String(r.id),
        label: emailsMatch(r.email, user?.email) ? `${label} — você` : label,
      };
    });
  }, [catalogs, user?.email]);

  const requestorOptions = useMemo(
    () =>
      (catalogs?.requestors ?? []).map((r) => ({
        value: String(r.id),
        label: r.email ? `${r.name} (${r.email})` : r.name,
      })),
    [catalogs],
  );

  const ccOptions = useMemo(() => {
    const selected = new Set(ccPeople.map((p) => p.email.toLowerCase()));
    return (catalogs?.responsibles ?? [])
      .filter((r) => {
        const email = r.email?.trim().toLowerCase();
        return Boolean(email) && !selected.has(email!);
      })
      .map((r) => ({
        value: r.email!.trim().toLowerCase(),
        label: `${r.name} (${r.email!.trim()})`,
      }));
  }, [catalogs, ccPeople]);

  const gmudSelectOptions = useMemo(
    () =>
      gmudOptions.map((g) => ({
        value: String(g.code),
        label: `#${g.code} — ${g.title}`,
      })),
    [gmudOptions],
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
    if (!requestorName.trim()) missing.push("Solicitante");
    if (!requestorEmail.trim()) missing.push("E-mail do solicitante");
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
    requestorName,
    requestorEmail,
  ]);

  const canSubmit =
    !loading &&
    !saving &&
    !catalogBlocked &&
    missingRequired.length === 0;

  const prevDeskIdRef = useRef("");
  const responsiblePrefillDone = useRef(false);

  const loadCatalogs = useCallback(
    async (params?: { deskId?: number; clientId?: number }) => {
      try {
        setLoading(true);
        const data = await ticketsService.createCatalogs(params);
        setCatalogs(data);
        setClientId((prev) => {
          if (data.clients.length === 1) {
            return String(data.clients[0].id);
          }
          if (
            isClientUser &&
            data.clients.length > 0 &&
            !data.clients.some((c) => String(c.id) === prev)
          ) {
            return String(data.clients[0].id);
          }
          return prev;
        });
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
    [isClientUser],
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

  useEffect(() => {
    if (responsiblePrefillDone.current || responsibleId) return;
    const match = findByEmail(catalogs?.responsibles ?? [], user?.email);
    if (!match) return;
    setResponsibleId(String(match.id));
    responsiblePrefillDone.current = true;
  }, [catalogs, responsibleId, user?.email]);

  useEffect(() => {
    const companyId = selectedClient?.companyId;
    if (!companyId) {
      setGmudOptions([]);
      setExternalGmudRef("");
      return;
    }
    let cancelled = false;
    setLoadingGmuds(true);
    void gmudsService
      .list({ companyId })
      .then((rows) => {
        if (!cancelled) setGmudOptions(rows);
      })
      .catch(() => {
        if (!cancelled) setGmudOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingGmuds(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedClient?.companyId]);

  function handleClientChange(nextClientId: string) {
    const nextClient =
      catalogs?.clients.find((c) => String(c.id) === nextClientId) ?? null;
    setTitle((prev) =>
      applyClientTitlePrefix(
        prev,
        (catalogs?.clients ?? []).map((c) => c.name),
        nextClient?.name ?? null,
      ),
    );
    setClientId(nextClientId);
    setRequestorId("");
    setExternalGmudRef("");
  }

  function handleRequestorSuggestion(nextRequestorId: string) {
    setRequestorId(nextRequestorId);
    if (!nextRequestorId) {
      setRequestorName("");
      setRequestorEmail("");
      setRequestorTelephone("");
      return;
    }
    const selected = (catalogs?.requestors ?? []).find(
      (row) => String(row.id) === nextRequestorId,
    );
    if (!selected) return;
    setRequestorName(selected.name ?? "");
    setRequestorEmail(selected.email ?? "");
    setRequestorTelephone(
      selected.telephone ? formatBrPhone(selected.telephone) : "",
    );
  }

  function openNewRequestorModal() {
    setNewRequestorName("");
    setNewRequestorEmail("");
    setNewRequestorTelephone("");
    setNewRequestorOpen(true);
  }

  function confirmNewRequestor() {
    const name = newRequestorName.trim();
    const email = newRequestorEmail.trim();
    if (!name) {
      notifyError("Informe o nome do solicitante.");
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      notifyError("Informe um e-mail válido do solicitante.");
      return;
    }
    if (
      newRequestorTelephone.trim() &&
      !isValidBrPhone(newRequestorTelephone)
    ) {
      notifyError("Telefone inválido. Use DDD + número.");
      return;
    }
    setRequestorId("");
    setRequestorName(name);
    setRequestorEmail(email);
    setRequestorTelephone(
      newRequestorTelephone.trim()
        ? formatBrPhone(newRequestorTelephone)
        : "",
    );
    setNewRequestorOpen(false);
    notifySuccess("Solicitante preenchido. Continue a abertura do chamado.");
  }

  function addCcPerson(emailRaw: string, name?: string) {
    const email = emailRaw.trim().toLowerCase();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      notifyError("E-mail em cópia inválido.");
      return;
    }
    setCcPeople((prev) => {
      if (prev.some((p) => p.email === email)) return prev;
      return [...prev, { email, name }];
    });
    setCcSelectValue("");
  }

  function handleCcSelect(nextEmail: string) {
    if (!nextEmail) {
      setCcSelectValue("");
      return;
    }
    const selected = (catalogs?.responsibles ?? []).find(
      (r) => r.email?.trim().toLowerCase() === nextEmail,
    );
    addCcPerson(nextEmail, selected?.name);
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

    if (!requestorName.trim()) {
      notifyError("Informe o nome do solicitante.");
      return;
    }
    if (!requestorEmail.trim()) {
      notifyError("Informe o e-mail do solicitante.");
      return;
    }
    if (requestorTelephone.trim() && !isValidBrPhone(requestorTelephone)) {
      notifyError("Telefone inválido. Use DDD + número.");
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
          requestorName: requestorName.trim(),
          requestorEmail: requestorEmail.trim(),
          requestorTelephone: requestorTelephone.trim() || undefined,
          externalGmudRef: externalGmudRef.trim() || undefined,
          ccEmails:
            ccPeople.length > 0 ? ccPeople.map((p) => p.email) : undefined,
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
                        placeholder={
                          selectedClient
                            ? `${selectedClient.name.toUpperCase()} - Resumo do problema`
                            : "Resumo do problema ou solicitação"
                        }
                        className="h-11"
                        required
                      />
                    </div>
                    <AppointmentDescriptionComposer
                      ref={descriptionComposerRef}
                      disabled={saving}
                      labelClassName="text-xs font-semibold text-muted-foreground"
                      placeholder="Detalhe o que precisa ser atendido"
                      hintText="Escreva e cole prints na descrição (Ctrl+V). Arraste a alça para ajustar o tamanho do print. ZIP/PDF em Anexos."
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
                      {isClientUser && clientOptions.length <= 1 ? (
                        <Input
                          value={clientOptions[0]?.label ?? selectedClient?.name ?? ""}
                          readOnly
                          disabled
                          className="h-11"
                        />
                      ) : (
                        <SearchableSelectField
                          value={clientId}
                          onChange={handleClientChange}
                          options={clientOptions}
                          loading={loading}
                          emptyLabel="Selecione o cliente"
                          disabled={isClientUser && clientOptions.length <= 1}
                        />
                      )}
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
                        preserveOrder
                        emptyLabel={
                          responsibleOptions.length === 0
                            ? isClientUser
                              ? "Nenhum usuário na empresa"
                              : "Nenhum atendente encontrado"
                            : "Selecione o responsável"
                        }
                        placeholder="Selecione o responsável"
                      />
                    </div>
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-end justify-between gap-2">
                        <FieldLabel required>Solicitante</FieldLabel>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8"
                          disabled={saving || !clientId}
                          onClick={openNewRequestorModal}
                        >
                          <Plus className="mr-1 size-3.5" />
                          Novo solicitante
                        </Button>
                      </div>
                      {requestorOptions.length > 0 ? (
                        <SearchableSelectField
                          value={requestorId}
                          onChange={handleRequestorSuggestion}
                          options={requestorOptions}
                          loading={loading}
                          emptyLabel="Selecione o solicitante"
                          placeholder="Selecione ou adicione um novo"
                        />
                      ) : null}
                      <div className="space-y-2">
                        <FieldLabel required>Nome</FieldLabel>
                        <Input
                          value={requestorName}
                          onChange={(e) => {
                            setRequestorName(e.target.value);
                            setRequestorId("");
                          }}
                          placeholder="Nome de quem está solicitando"
                          className="h-11"
                          disabled={saving}
                          required
                        />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <FieldLabel required>E-mail do solicitante</FieldLabel>
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
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <FieldLabel optional>Telefone</FieldLabel>
                          <Input
                            value={requestorTelephone}
                            onChange={(e) => {
                              setRequestorTelephone(formatBrPhone(e.target.value));
                              setRequestorId("");
                            }}
                            placeholder="(00) 00000-0000"
                            className="h-11"
                            disabled={saving}
                            inputMode="tel"
                          />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Não está na lista? Use &quot;Novo solicitante&quot; para
                        preencher na hora (ex.: caixa compartilhada).
                      </p>
                    </div>

                    <div className="space-y-2">
                      <FieldLabel optional>GMUD do cliente</FieldLabel>
                      <SearchableSelectField
                        value={externalGmudRef}
                        onChange={setExternalGmudRef}
                        options={gmudSelectOptions}
                        loading={loadingGmuds}
                        emptyLabel={
                          !selectedClient?.companyId
                            ? "Selecione o cliente para listar GMUDs"
                            : gmudSelectOptions.length === 0
                              ? "Nenhuma GMUD cadastrada para este cliente"
                              : "Selecione a GMUD (opcional)"
                        }
                        placeholder="Selecione a GMUD"
                      />
                      <p className="text-xs text-muted-foreground">
                        Lista das GMUDs cadastradas no portal para a empresa do
                        cliente. O número fica vinculado ao chamado.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <FieldLabel optional>Pessoas em cópia</FieldLabel>
                      <SearchableSelectField
                        value={ccSelectValue}
                        onChange={handleCcSelect}
                        options={ccOptions}
                        loading={loading}
                        emptyLabel={
                          ccOptions.length === 0
                            ? ccPeople.length > 0
                              ? "Todos os responsáveis já foram adicionados"
                              : "Nenhum responsável disponível"
                            : "Selecione um responsável"
                        }
                        placeholder="Selecione um responsável"
                        searchPlaceholder="Buscar responsável..."
                        alwaysShowSearch
                        disabled={saving || ccOptions.length === 0}
                      />
                      {ccPeople.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {ccPeople.map((person) => (
                            <span
                              key={person.email}
                              className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs"
                            >
                              {person.name
                                ? `${person.name} (${person.email})`
                                : person.email}
                              <button
                                type="button"
                                className="text-muted-foreground hover:text-foreground"
                                onClick={() =>
                                  setCcPeople((prev) =>
                                    prev.filter(
                                      (item) => item.email !== person.email,
                                    ),
                                  )
                                }
                                aria-label={`Remover ${person.email}`}
                              >
                                <X className="size-3.5" />
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        Lista dos responsáveis do chamado. Quem estiver na cópia
                        passa a ver o chamado em Meus chamados.
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

          <Dialog open={newRequestorOpen} onOpenChange={setNewRequestorOpen}>
            <DialogContent className="sm:max-w-md" showCloseButton>
              <DialogHeader>
                <DialogTitle>Novo solicitante</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-2">
                  <FieldLabel required>Nome</FieldLabel>
                  <Input
                    value={newRequestorName}
                    onChange={(e) => setNewRequestorName(e.target.value)}
                    placeholder="Nome completo"
                    className="h-11"
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <FieldLabel required>E-mail</FieldLabel>
                  <Input
                    type="email"
                    value={newRequestorEmail}
                    onChange={(e) => setNewRequestorEmail(e.target.value)}
                    placeholder="alleone.teste@alletecnologia.com"
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <FieldLabel optional>Telefone</FieldLabel>
                  <Input
                    value={newRequestorTelephone}
                    onChange={(e) =>
                      setNewRequestorTelephone(formatBrPhone(e.target.value))
                    }
                    placeholder="(00) 00000-0000"
                    className="h-11"
                    inputMode="tel"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setNewRequestorOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="button" onClick={confirmNewRequestor}>
                  Usar no chamado
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </AppShell>
      </PermissionGate>
    </ProtectedPage>
  );
}
