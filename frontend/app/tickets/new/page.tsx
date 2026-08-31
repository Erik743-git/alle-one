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
import { TicketFollowersDialog } from "@/components/tickets/ticket-followers-dialog";
import { TicketNoResponsiblePreTicketDialog } from "@/components/tickets/ticket-no-responsible-preticket-dialog";
import { currentUserResponsibleId } from "@/components/tickets/ticket-responsible-select";
import { refreshPreTicketsBadge } from "@/components/layout/pre-tickets-badge";
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
  portalRequestorSyntheticId,
} from "@/lib/ticket-form";
import {
  ticketsService,
  type TicketCreateCatalogs,
} from "@/lib/services/tickets.service";
import { shouldShowNoResponsiblePreTicketWarning } from "@/lib/ticket-no-responsible-warning";
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
  const [followersOpen, setFollowersOpen] = useState(false);
  const [externalGmudRef, setExternalGmudRef] = useState("");
  const [gmudOptions, setGmudOptions] = useState<Gmud[]>([]);
  const [loadingGmuds, setLoadingGmuds] = useState(false);
  const [ccPeople, setCcPeople] = useState<
    Array<{ email: string; name?: string }>
  >([]);
  const [noResponsibleWarningOpen, setNoResponsibleWarningOpen] = useState(false);
  const pendingSubmitRef = useRef<(() => Promise<void>) | null>(null);

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

  const usesServiceCatalogTree = Boolean(
    catalogs?.classification?.usesServiceCatalogTree ??
      catalogs?.classification?.syncedFromTiflux,
  );

  const showCatalogPicker = requiresCatalog && !usesServiceCatalogTree;

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

  const requestorOptions = useMemo(() => {
    const base = [...(catalogs?.requestors ?? [])];
    if (
      user?.email?.trim() &&
      !base.some((row) => emailsMatch(row.email, user.email))
    ) {
      base.push({
        id: portalRequestorSyntheticId(user.email),
        name: user.name?.trim() || user.email,
        email: user.email,
        telephone: null,
      });
    }
    const sorted = pinCurrentUserFirst(base, user?.email);
    return sorted.map((r) => {
      const label = r.email ? `${r.name} (${r.email})` : r.name;
      return {
        value: String(r.id),
        label: emailsMatch(r.email, user?.email) ? `${label} — você` : label,
      };
    });
  }, [catalogs?.requestors, user?.email, user?.name]);

  const gmudSelectOptions = useMemo(
    () =>
      gmudOptions.map((g) => ({
        value: String(g.code),
        label: `#${g.code} — ${g.title}`,
      })),
    [gmudOptions],
  );

  const catalogBlocked =
    showCatalogPicker && deskId !== "" && catalogItemOptions.length === 0;

  const requiresPriority =
    Boolean(deskId) && !showCatalogPicker && !hasPortalClassification;

  const missingRequired = useMemo(() => {
    const missing: string[] = [];
    if (!title.trim()) missing.push("Título");
    if (!clientId) missing.push("Cliente");
    if (!deskId) missing.push("Catálogo");
    if (deskId && hasPortalClassification && !classificationId) {
      missing.push("Classificação");
    }
    if (deskId && showCatalogPicker && !catalogBlocked && !catalogItemId) {
      missing.push("Serviço");
    }
    if (requiresPriority && !priorityId) missing.push("Prioridade");
    if (!isClientUser) {
      if (!requestorName.trim()) missing.push("Solicitante");
      if (!requestorEmail.trim()) missing.push("E-mail do solicitante");
    }
    // Responsável agora é opcional - se não for selecionado, vira pré-ticket
    return missing;
  }, [
    title,
    clientId,
    deskId,
    hasPortalClassification,
    classificationId,
    showCatalogPicker,
    catalogBlocked,
    catalogItemId,
    requiresPriority,
    priorityId,
    requestorName,
    requestorEmail,
    isClientUser,
  ]);

  const canSubmit =
    !loading &&
    !saving &&
    !catalogBlocked &&
    missingRequired.length === 0;

  const prevDeskIdRef = useRef("");
  const responsiblePrefillDone = useRef(false);
  const responsiblePrefillSkipped = useRef(false);
  const clientRequestorPrefillDone = useRef(false);
  const internalRequestorPrefillDone = useRef(false);

  useEffect(() => {
    responsiblePrefillDone.current = false;
    responsiblePrefillSkipped.current = false;
  }, [deskId, clientId]);

  useEffect(() => {
    internalRequestorPrefillDone.current = false;
  }, [clientId]);

  const loadCatalogs = useCallback(
    async (params?: { deskId?: number; clientId?: number }) => {
      try {
        setLoading(true);
        const data = await ticketsService.createCatalogs(params);
        setCatalogs(data);
        setDeskId((prev) => {
          if (!prev) return prev;
          const stillAllowed = data.desks.some((d) => String(d.id) === prev);
          return stillAllowed ? prev : "";
        });
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
    if (!isClientUser || !user?.email?.trim()) return;
    setRequestorName((prev) => prev || user.name?.trim() || "");
    setRequestorEmail((prev) => prev || user.email.trim());
  }, [isClientUser, user?.name, user?.email]);

  useEffect(() => {
    if (!isClientUser || clientRequestorPrefillDone.current) return;
    if (!user?.email?.trim()) return;

    setRequestorName(user.name?.trim() ?? "");
    setRequestorEmail(user.email.trim());

    const matched = findByEmail(catalogs?.requestors ?? [], user.email);
    if (matched) {
      setRequestorId(String(matched.id));
      if (matched.telephone) {
        setRequestorTelephone(formatBrPhone(matched.telephone));
      }
    } else {
      setRequestorId("");
    }
    clientRequestorPrefillDone.current = true;
  }, [isClientUser, user?.name, user?.email, catalogs?.requestors]);

  useEffect(() => {
    if (isClientUser || internalRequestorPrefillDone.current) return;
    if (!user?.email?.trim() || !clientId) return;

    const matched = findByEmail(catalogs?.requestors ?? [], user.email);
    const id = matched
      ? String(matched.id)
      : String(portalRequestorSyntheticId(user.email));
    setRequestorId(id);
    setRequestorName(matched?.name?.trim() || user.name?.trim() || "");
    setRequestorEmail(matched?.email?.trim() || user.email.trim());
    internalRequestorPrefillDone.current = true;
  }, [
    isClientUser,
    user?.name,
    user?.email,
    clientId,
    catalogs?.requestors,
  ]);

  useEffect(() => {
    if (
      isClientUser ||
      responsiblePrefillDone.current ||
      responsiblePrefillSkipped.current ||
      responsibleId
    ) {
      return;
    }
    const list = catalogs?.responsibles ?? [];
    if (!list.length) return;
    const matchId =
      currentUserResponsibleId(list, user?.email) ??
      (user?.name
        ? (list.find(
            (item) =>
              item.name?.trim().toLocaleLowerCase("pt-BR") ===
              user.name.trim().toLocaleLowerCase("pt-BR"),
          )?.id ?? null)
        : null);
    if (matchId == null) return;
    setResponsibleId(String(matchId));
    responsiblePrefillDone.current = true;
  }, [catalogs, responsibleId, user?.email, user?.name, isClientUser]);

  function handleResponsibleChange(value: string) {
    responsiblePrefillSkipped.current = true;
    responsiblePrefillDone.current = true;
    setResponsibleId(value);
  }

  useEffect(() => {
    if (isClientUser) {
      setGmudOptions([]);
      setExternalGmudRef("");
      return;
    }
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
  }, [selectedClient?.companyId, isClientUser]);

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
    if (!isClientUser) {
      setRequestorId("");
      setRequestorName("");
      setRequestorEmail("");
      setRequestorTelephone("");
      internalRequestorPrefillDone.current = false;
    }
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

  function addFollower(person: { email: string; name?: string }) {
    const email = person.email.trim().toLowerCase();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      notifyError("E-mail do seguidor inválido.");
      return;
    }
    if (emailsMatch(email, requestorEmail)) {
      notifyError("Esse e-mail já é o do solicitante.");
      return;
    }
    setCcPeople((prev) => {
      if (prev.some((p) => p.email === email)) return prev;
      return [...prev, { email, name: person.name }];
    });
  }

  function renderFollowersFields(className?: string) {
    return (
      <div className={className}>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <FieldLabel optional>Seguidores</FieldLabel>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            disabled={saving}
            onClick={() => setFollowersOpen(true)}
          >
            <Plus className="mr-1 size-3.5" />
            Novo seguidor
          </Button>
        </div>
        {ccPeople.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
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
                      prev.filter((item) => item.email !== person.email),
                    )
                  }
                  aria-label={`Remover seguidor ${person.email}`}
                >
                  <X className="size-3.5" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Nenhum seguidor. Use &quot;Novo seguidor&quot; para adicionar
            pessoas que receberão atualizações por e-mail.
          </p>
        )}
      </div>
    );
  }

  async function performCreate() {
    const content = descriptionComposerRef.current?.exportContent();
    const description = content?.description?.trim() ?? "";
    const files = content?.files ?? [];

    const parsedClient = Number(clientId);
    const parsedDesk = Number(deskId);

    const wantsNoResponsible = !responsibleId;
    const resolvedResponsibleId = wantsNoResponsible
      ? null
      : Number(responsibleId);

    if (
      !wantsNoResponsible &&
      !Number.isFinite(resolvedResponsibleId)
    ) {
      notifyError("Responsável selecionado inválido.");
      return;
    }

    try {
      setSaving(true);
      const resolvedRequestorName =
        requestorName.trim() || user?.name?.trim() || "";
      const resolvedRequestorEmail =
        requestorEmail.trim() || user?.email?.trim() || "";
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
          responsibleId: resolvedResponsibleId,
          requestorId: requestorId ? Number(requestorId) : undefined,
          requestorName: resolvedRequestorName,
          requestorEmail: resolvedRequestorEmail,
          requestorTelephone: requestorTelephone.trim() || undefined,
          externalGmudRef:
            !isClientUser && externalGmudRef.trim()
              ? externalGmudRef.trim()
              : undefined,
          ccEmails:
            ccPeople.length > 0 ? ccPeople.map((p) => p.email) : undefined,
        },
        files,
      );
      notifySuccess(res.message);
      if (res.isPreTicket) {
        refreshPreTicketsBadge();
      }
      const createdNumber = Number(res.ticketNumber);
      if (!Number.isFinite(createdNumber) || createdNumber <= 0) {
        notifyError("Chamado criado, mas não foi possível abrir a página.");
        router.replace("/tickets");
        return;
      }
      router.replace(`/tickets/${createdNumber}`);
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível criar o ticket.",
      );
    } finally {
      setSaving(false);
    }
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
      notifyError("Preencha título, descrição, cliente e catálogo.");
      return;
    }

    if (hasPortalClassification && !classificationId) {
      notifyError("Selecione a classificação do catálogo.");
      return;
    }

    if (showCatalogPicker && !catalogItemId) {
      notifyError("Selecione o serviço do catálogo.");
      return;
    }

    if (!showCatalogPicker && !hasPortalClassification && !priorityId) {
      notifyError("Selecione a prioridade.");
      return;
    }

    if (!requestorName.trim() && !isClientUser) {
      notifyError("Informe o nome do solicitante.");
      return;
    }
    if (!requestorEmail.trim() && !isClientUser) {
      notifyError("Informe o e-mail do solicitante.");
      return;
    }
    if (
      isClientUser &&
      !(requestorEmail.trim() || user?.email?.trim())
    ) {
      notifyError("Não foi possível identificar seu e-mail para abrir o ticket.");
      return;
    }
    if (requestorTelephone.trim() && !isValidBrPhone(requestorTelephone)) {
      notifyError("Telefone inválido. Use DDD + número.");
      return;
    }

    if (!responsibleId && !isClientUser && shouldShowNoResponsiblePreTicketWarning()) {
      pendingSubmitRef.current = performCreate;
      setNoResponsibleWarningOpen(true);
      return;
    }

    await performCreate();
  }

  const canCreate = canCreateTicket();

  return (
    <ProtectedPage>
      <PermissionGate module="TICKETS">
        <AppShell>
          <div className="font-sans w-full space-y-6 pb-28">
            <PageHeader
              backHref="/tickets"
              backLabel="Voltar à lista"
              icon={<Plus size={24} />}
              title="Novo ticket"
              description={
                canCreate ? TICKETS_NEW_SUBTITLE : TICKETS_CREATE_ADMIN_ONLY_MESSAGE
              }
            />

            {!canCreate ? null : loading && !catalogs ? (
              <FormSkeleton />
            ) : (
              <form
                id="new-ticket-form"
                onSubmit={(e) => void handleSubmit(e)}
                className="space-y-6"
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Building2 className="size-4 text-primary" />
                      Cliente e catálogo
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
                      <FieldLabel required>Catálogo</FieldLabel>
                      <SearchableSelectField
                        value={deskId}
                        onChange={setDeskId}
                        options={deskOptions}
                        loading={loading}
                        emptyLabel="Selecione o catálogo"
                      />
                    </div>

                    {renderFollowersFields(
                      "space-y-2 border-t border-border pt-4 sm:col-span-2",
                    )}

                    {deskId && showCatalogPicker ? (
                      <div className="space-y-2 sm:col-span-2">
                        <FieldLabel required>Serviço</FieldLabel>
                        <SearchableSelectField
                          value={catalogItemId}
                          onChange={setCatalogItemId}
                          options={catalogItemOptions}
                          loading={loading}
                          emptyLabel={
                            catalogItemOptions.length === 0
                              ? "Nenhum serviço cadastrado neste catálogo"
                              : "Selecione o serviço"
                          }
                        />
                        {catalogBlocked ? (
                          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/90">
                            Este catálogo exige serviços, mas não há itens
                            cadastrados. Cadastre serviços no catálogo{" "}
                            <strong>{catalogs?.desk?.name ?? "selecionado"}</strong>{" "}
                            antes de abrir tickets.
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
                      <FileText className="size-4 text-primary" />
                      Conteúdo do ticket
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

                {!isClientUser ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <UserRound className="size-4 text-primary" />
                      Solicitante
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-xs text-muted-foreground">
                      Escolha um solicitante cadastrado ou preencha os dados manualmente
                      (ex.: caixa compartilhada).
                    </p>
                    {requestorOptions.length > 0 ? (
                      <div className="space-y-2">
                        <FieldLabel required>Solicitante cadastrado</FieldLabel>
                        <SearchableSelectField
                          value={requestorId}
                          onChange={handleRequestorSuggestion}
                          options={requestorOptions}
                          loading={loading}
                          emptyLabel="Selecione o solicitante"
                          placeholder="Selecione o solicitante"
                        />
                      </div>
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
                            setRequestorTelephone(
                              formatBrPhone(e.target.value),
                            );
                            setRequestorId("");
                          }}
                          placeholder="(00) 00000-0000"
                          className="h-11"
                          disabled={saving}
                          inputMode="tel"
                        />
                      </div>
                    </div>

                    <div className="space-y-2 border-t border-border pt-4">
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
                        cliente. O número fica vinculado ao ticket.
                      </p>
                    </div>
                  </CardContent>
                </Card>
                ) : null}

                {(!isClientUser || (deskId && hasPortalClassification)) ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <UserRound className="size-4 text-primary" />
                      {isClientUser ? "Classificação" : "Responsável e classificação"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
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
                    {!isClientUser ? (
                      <div className="space-y-2">
                        <FieldLabel optional>Responsável</FieldLabel>
                        <SearchableSelectField
                          value={responsibleId}
                          onChange={handleResponsibleChange}
                          options={responsibleOptions}
                          loading={loading}
                          preserveOrder
                          emptyLabel={
                            responsibleOptions.length === 0
                              ? "Nenhum atendente encontrado para este catálogo"
                              : "Selecione o responsável (opcional)"
                          }
                          placeholder="Selecione o responsável (opcional)"
                        />
                        {!responsibleId ? (
                          <p className="text-xs text-muted-foreground">
                            Se não selecionar um responsável, o ticket será criado como pré-ticket e ficará aguardando atribuição.
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
                ) : null}

                <div className="space-y-3">
                  {!canSubmit && !loading && !saving ? (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-50/95">
                      {catalogBlocked ? (
                        <p>
                          Não é possível abrir o ticket: o catálogo exige serviços, mas
                          não há itens cadastrados.
                        </p>
                      ) : missingRequired.length > 0 ? (
                        <>
                          <p className="font-semibold">
                            Preencha os campos obrigatórios para habilitar Abrir ticket:
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
                </div>

                <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-end p-4 sm:p-6">
                  <Button
                    type="submit"
                    form="new-ticket-form"
                    size="lg"
                    disabled={!canSubmit}
                    className="pointer-events-auto h-14 rounded-full px-6 shadow-[0_12px_40px_rgba(0,0,0,0.35)]"
                  >
                    {saving ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : null}
                    Abrir ticket
                  </Button>
                </div>
              </form>
            )}
          </div>

          <TicketFollowersDialog
            open={followersOpen}
            onOpenChange={setFollowersOpen}
            selected={ccPeople}
            requestors={catalogs?.requestors}
            responsibles={catalogs?.responsibles}
            excludeEmails={[requestorEmail]}
            onAdd={addFollower}
          />

          <TicketNoResponsiblePreTicketDialog
            open={noResponsibleWarningOpen}
            onOpenChange={setNoResponsibleWarningOpen}
            onConfirm={() => {
              const run = pendingSubmitRef.current;
              pendingSubmitRef.current = null;
              void run?.();
            }}
          />
        </AppShell>
      </PermissionGate>
    </ProtectedPage>
  );
}
