"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, FileText, Loader2, Plus, UserRound } from "lucide-react";

import AppShell from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelectField } from "@/components/ui/searchable-select-field";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  canCreateTicketsAndAppointments,
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
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
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
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </CardContent>
      </Card>
    </div>
  );
}

export default function NewTicketPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [catalogs, setCatalogs] = useState<TicketCreateCatalogs | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [clientId, setClientId] = useState("");
  const [deskId, setDeskId] = useState("");
  const [priorityId, setPriorityId] = useState("");
  const [catalogItemId, setCatalogItemId] = useState("");
  const [responsibleId, setResponsibleId] = useState("");
  const [requestorName, setRequestorName] = useState("");
  const [requestorEmail, setRequestorEmail] = useState("");
  const [requestorTelephone, setRequestorTelephone] = useState("");

  const selectedDesk = useMemo(
    () => catalogs?.desks.find((d) => String(d.id) === deskId) ?? null,
    [catalogs, deskId],
  );

  const requiresCatalog =
    catalogs?.desk?.requireServiceCatalog ?? selectedDesk?.requireServiceCatalog;

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
        label: r.name,
      })),
    [catalogs],
  );

  const summaryClient = clientOptions.find((c) => c.value === clientId)?.label;
  const summaryDesk = deskOptions.find((d) => d.value === deskId)?.label;

  const loadCatalogs = useCallback(async (nextDeskId?: number) => {
    try {
      setLoading(true);
      const data = await ticketsService.createCatalogs(nextDeskId);
      setCatalogs(data);
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível carregar os dados.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalogs();
  }, [loadCatalogs]);

  useEffect(() => {
    if (!deskId) return;
    const id = Number(deskId);
    if (!Number.isFinite(id)) return;
    setPriorityId("");
    setCatalogItemId("");
    void loadCatalogs(id);
  }, [deskId, loadCatalogs]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsedClient = Number(clientId);
    const parsedDesk = Number(deskId);
    if (
      !title.trim() ||
      !description.trim() ||
      !Number.isFinite(parsedClient) ||
      !Number.isFinite(parsedDesk)
    ) {
      notifyError("Preencha título, descrição, cliente e mesa.");
      return;
    }

    try {
      setSaving(true);
      const res = await ticketsService.createTicket({
        title: title.trim(),
        description: description.trim(),
        clientId: parsedClient,
        deskId: parsedDesk,
        priorityId: priorityId ? Number(priorityId) : undefined,
        servicesCatalogsItemId: catalogItemId
          ? Number(catalogItemId)
          : undefined,
        responsibleId: responsibleId ? Number(responsibleId) : undefined,
        requestorName: requestorName.trim() || undefined,
        requestorEmail: requestorEmail.trim() || undefined,
        requestorTelephone: requestorTelephone.trim() || undefined,
      });
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

  const canCreate = canCreateTicketsAndAppointments();

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
              <form
                onSubmit={(e) => void handleSubmit(e)}
                className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"
              >
                <div className="space-y-6">
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
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold text-muted-foreground">
                          Descrição
                        </Label>
                        <Textarea
                          rows={6}
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="Detalhe o que precisa ser atendido"
                          className="min-h-[140px]"
                          required
                        />
                      </div>
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
                          onChange={setClientId}
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
                      {deskId ? (
                        requiresCatalog ? (
                          <div className="space-y-2 sm:col-span-2">
                            <Label className="text-xs font-semibold text-muted-foreground">
                              Serviço do catálogo
                            </Label>
                            <SearchableSelectField
                              value={catalogItemId}
                              onChange={setCatalogItemId}
                              options={catalogItemOptions}
                              loading={loading}
                              emptyLabel="Selecione o serviço"
                            />
                          </div>
                        ) : (
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
                        )
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
                          emptyLabel="Eu (usuário logado)"
                          placeholder="Eu (usuário logado)"
                        />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold text-muted-foreground">
                            Solicitante
                          </Label>
                          <Input
                            value={requestorName}
                            onChange={(e) => setRequestorName(e.target.value)}
                            placeholder="Nome"
                            className="h-11"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold text-muted-foreground">
                            E-mail
                          </Label>
                          <Input
                            type="email"
                            value={requestorEmail}
                            onChange={(e) => setRequestorEmail(e.target.value)}
                            className="h-11"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold text-muted-foreground">
                            Telefone
                          </Label>
                          <Input
                            value={requestorTelephone}
                            onChange={(e) =>
                              setRequestorTelephone(e.target.value)
                            }
                            className="h-11"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Button type="submit" size="lg" disabled={saving || loading}>
                    {saving ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : null}
                    Abrir chamado
                  </Button>
                </div>

                <Card className="h-fit lg:sticky lg:top-24">
                  <CardHeader>
                    <CardTitle className="text-base">Resumo</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div>
                      <p className="text-xs font-semibold uppercase text-muted-foreground">
                        Título
                      </p>
                      <p className="mt-0.5 font-medium text-foreground">
                        {title.trim() || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-muted-foreground">
                        Cliente
                      </p>
                      <p className="mt-0.5 text-foreground">
                        {summaryClient || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-muted-foreground">
                        Mesa
                      </p>
                      <p className="mt-0.5 text-foreground">
                        {summaryDesk || "—"}
                      </p>
                    </div>
                    {catalogs?.desk?.appointmentType ? (
                      <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                        Tipo de apontamento desta mesa:{" "}
                        <span className="font-medium text-foreground">
                          {catalogs.desk.appointmentType}
                        </span>
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              </form>
            )}
          </div>
        </AppShell>
      </PermissionGate>
    </ProtectedPage>
  );
}
