"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Plus } from "lucide-react";

import AppShell from "@/components/layout/app-shell";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  canCreateTicketsAndAppointments,
  TICKETS_CREATE_ADMIN_ONLY_MESSAGE,
} from "@/lib/access-control";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  ticketsService,
  type TicketCreateCatalogs,
} from "@/lib/services/tickets.service";

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

  const requiresCatalog = catalogs?.desk?.requireServiceCatalog ?? selectedDesk?.requireServiceCatalog;

  const loadCatalogs = useCallback(async (nextDeskId?: number) => {
    try {
      setLoading(true);
      const data = await ticketsService.createCatalogs(nextDeskId);
      setCatalogs(data);
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível carregar os catálogos.",
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
    if (!title.trim() || !description.trim() || !Number.isFinite(parsedClient) || !Number.isFinite(parsedDesk)) {
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
        servicesCatalogsItemId: catalogItemId ? Number(catalogItemId) : undefined,
        responsibleId: responsibleId ? Number(responsibleId) : undefined,
        requestorName: requestorName.trim() || undefined,
        requestorEmail: requestorEmail.trim() || undefined,
        requestorTelephone: requestorTelephone.trim() || undefined,
      });
      notifySuccess(res.message);
      router.push(`/tickets/${res.ticketNumber}`);
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível criar o ticket.",
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
          <div className="font-sans mx-auto w-full max-w-3xl space-y-6">
            <Button asChild variant="outline" size="sm" className="w-fit">
              <Link href="/tickets">
                <ArrowLeft className="mr-2 size-4" />
                Voltar à lista
              </Link>
            </Button>

            <div className="space-y-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Plus size={24} />
              </div>
              <h1 className="text-3xl font-bold text-foreground">Novo ticket</h1>
              {canCreate ? (
                <p className="text-muted-foreground">
                  Cria no TiFlux via API (<code className="text-xs">POST /tickets</code>, multipart).
                  Após o sync, aparece na lista local.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {TICKETS_CREATE_ADMIN_ONLY_MESSAGE}
                </p>
              )}
            </div>

            {!canCreate ? null : loading && !catalogs ? (
              <div className="flex min-h-[200px] items-center justify-center">
                <Loader2 className="size-8 animate-spin text-primary" />
              </div>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Dados do chamado</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
                    <div className="space-y-1">
                      <Label htmlFor="title">Título</Label>
                      <Input
                        id="title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="description">Descrição</Label>
                      <Textarea
                        id="description"
                        rows={5}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        required
                      />
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <Label>Cliente</Label>
                        <select
                          className="h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
                          value={clientId}
                          onChange={(e) => setClientId(e.target.value)}
                          required
                        >
                          <option value="">Selecione</option>
                          {(catalogs?.clients ?? []).map((c) => (
                            <option key={c.id} value={String(c.id)}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label>Mesa</Label>
                        <select
                          className="h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
                          value={deskId}
                          onChange={(e) => setDeskId(e.target.value)}
                          required
                        >
                          <option value="">Selecione</option>
                          {(catalogs?.desks ?? []).map((d) => (
                            <option key={d.id} value={String(d.id)}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {deskId ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        {requiresCatalog ? (
                          <div className="space-y-1 md:col-span-2">
                            <Label>Item do catálogo de serviços</Label>
                            <select
                              className="h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
                              value={catalogItemId}
                              onChange={(e) => setCatalogItemId(e.target.value)}
                              required
                            >
                              <option value="">Selecione</option>
                              {(catalogs?.catalogItems ?? []).map((item) => (
                                <option key={item.id} value={String(item.id)}>
                                  {item.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <div className="space-y-1 md:col-span-2">
                            <Label>Prioridade</Label>
                            <select
                              className="h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
                              value={priorityId}
                              onChange={(e) => setPriorityId(e.target.value)}
                              required
                            >
                              <option value="">Selecione</option>
                              {(catalogs?.priorities ?? []).map((p) => (
                                <option key={p.id} value={String(p.id)}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    ) : null}

                    <div className="space-y-1">
                      <Label>Responsável</Label>
                      <select
                        className="h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
                        value={responsibleId}
                        onChange={(e) => setResponsibleId(e.target.value)}
                      >
                        <option value="">Eu (usuário logado no TiFlux)</option>
                        {(catalogs?.responsibles ?? []).map((r) => (
                          <option key={r.id} value={String(r.id)}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-1">
                        <Label>Solicitante</Label>
                        <Input
                          value={requestorName}
                          onChange={(e) => setRequestorName(e.target.value)}
                          placeholder="Nome"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>E-mail</Label>
                        <Input
                          type="email"
                          value={requestorEmail}
                          onChange={(e) => setRequestorEmail(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Telefone</Label>
                        <Input
                          value={requestorTelephone}
                          onChange={(e) => setRequestorTelephone(e.target.value)}
                        />
                      </div>
                    </div>

                    {catalogs?.desk?.appointmentType ? (
                      <p className="text-xs text-muted-foreground">
                        Mesa: apontamentos — {catalogs.desk.appointmentType}
                      </p>
                    ) : null}

                    <Button type="submit" disabled={saving || loading}>
                      {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                      Criar ticket no TiFlux
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}
          </div>
        </AppShell>
      </PermissionGate>
    </ProtectedPage>
  );
}
