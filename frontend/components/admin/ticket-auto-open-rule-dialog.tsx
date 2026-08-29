"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { ClassificationCascadeFields } from "@/components/tickets/classification-cascade-fields";
import {
  AppointmentDescriptionComposer,
  type AppointmentBlockComposerHandle,
} from "@/components/tickets/appointment-description-composer";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { FieldLabel } from "@/components/ui/field-label";
import { FlipCheckbox } from "@/components/ui/flip-checkbox";
import { Input } from "@/components/ui/input";
import { SearchableSelectField } from "@/components/ui/searchable-select-field";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { notifyError } from "@/lib/notify";
import {
  adminService,
  TICKET_AUTO_OPEN_PERIODICITY_OPTIONS,
  type TicketAutoOpenRule,
  type TicketAutoOpenRulePayload,
  type TicketAutoOpenPeriodicity,
} from "@/lib/services/admin.service";
import {
  ticketsService,
  type TicketCreateCatalogs,
} from "@/lib/services/tickets.service";

const AUTO_OPEN_RESPONSIBLE_AUTO = "";
const AUTO_OPEN_RESPONSIBLE_PRE_TICKET = "__PRE_TICKET__";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: TicketAutoOpenRule | null;
  onSaved: () => void;
};

export function TicketAutoOpenRuleDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: Props) {
  const composerRef = useRef<AppointmentBlockComposerHandle>(null);
  const [loadingCatalogs, setLoadingCatalogs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [catalogs, setCatalogs] = useState<TicketCreateCatalogs | null>(null);

  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  const [periodicity, setPeriodicity] =
    useState<TicketAutoOpenPeriodicity>("DAILY");
  const [nextScheduledDate, setNextScheduledDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("08:00");
  const [deskId, setDeskId] = useState("");
  const [clientId, setClientId] = useState("");
  const [responsibleId, setResponsibleId] = useState("");
  const [priorityId, setPriorityId] = useState("");
  const [catalogItemId, setCatalogItemId] = useState("");
  const [classificationId, setClassificationId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [requestorName, setRequestorName] = useState("");
  const [requestorEmail, setRequestorEmail] = useState("");
  const [requestorTelephone, setRequestorTelephone] = useState("");
  const [externalGmudRef, setExternalGmudRef] = useState("");
  const [ccEmailsInput, setCcEmailsInput] = useState("");
  const [parentTicketNumber, setParentTicketNumber] = useState("");
  const [composerKey, setComposerKey] = useState(0);

  const selectedDesk = useMemo(
    () => catalogs?.desks.find((d) => String(d.id) === deskId) ?? null,
    [catalogs, deskId],
  );

  const requiresCatalog = Boolean(
    catalogs?.desk?.requireServiceCatalog ?? selectedDesk?.requireServiceCatalog,
  );

  const loadCatalogs = useCallback(async (desk?: number, client?: number) => {
    try {
      setLoadingCatalogs(true);
      const data = await ticketsService.createCatalogs({
        deskId: desk,
        clientId: client,
      });
      setCatalogs(data);
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível carregar catálogos.",
      );
      setCatalogs(null);
    } finally {
      setLoadingCatalogs(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setActive(editing.active);
      setPeriodicity(editing.periodicity);
      setNextScheduledDate(editing.nextScheduledDate);
      setScheduleTime(editing.scheduleTime);
      setDeskId(String(editing.deskExternalId));
      setClientId(String(editing.clientExternalId));
      setResponsibleId(
        editing.responsibleExternalId === -1
          ? AUTO_OPEN_RESPONSIBLE_PRE_TICKET
          : editing.responsibleExternalId === 0
            ? AUTO_OPEN_RESPONSIBLE_AUTO
            : String(editing.responsibleExternalId),
      );
      setPriorityId(
        editing.priorityExternalId != null
          ? String(editing.priorityExternalId)
          : "",
      );
      setCatalogItemId(
        editing.servicesCatalogsItemId != null
          ? String(editing.servicesCatalogsItemId)
          : "",
      );
      setClassificationId(editing.classificationId);
      setTitle(editing.title);
      setRequestorName(editing.requestorName);
      setRequestorEmail(editing.requestorEmail);
      setRequestorTelephone(editing.requestorTelephone ?? "");
      setExternalGmudRef(editing.externalGmudRef ?? "");
      setCcEmailsInput((editing.ccEmails ?? []).join(", "));
      setParentTicketNumber(
        editing.parentTicketNumber != null
          ? String(editing.parentTicketNumber)
          : "",
      );
      setComposerKey((k) => k + 1);
      void loadCatalogs(editing.deskExternalId, editing.clientExternalId);
    } else {
      setName("");
      setActive(true);
      setPeriodicity("DAILY");
      setNextScheduledDate(new Date().toISOString().slice(0, 10));
      setScheduleTime("08:00");
      setDeskId("");
      setClientId("");
      setResponsibleId("");
      setPriorityId("");
      setCatalogItemId("");
      setClassificationId(null);
      setTitle("");
      setRequestorName("");
      setRequestorEmail("");
      setRequestorTelephone("");
      setExternalGmudRef("");
      setCcEmailsInput("");
      setParentTicketNumber("");
      setComposerKey((k) => k + 1);
      void loadCatalogs();
    }
  }, [open, editing, loadCatalogs]);

  useEffect(() => {
    if (!open || !deskId) return;
    void loadCatalogs(Number(deskId), clientId ? Number(clientId) : undefined);
  }, [open, deskId, clientId, loadCatalogs]);

  async function handleSave() {
    const trimmedName = name.trim();
    const trimmedTitle = title.trim();
    if (!trimmedName) {
      notifyError("Informe o nome da regra.");
      return;
    }
    if (!nextScheduledDate) {
      notifyError("Informe a próxima data agendada.");
      return;
    }
    if (!deskId || !clientId) {
      notifyError("Selecione catálogo e cliente.");
      return;
    }
    if (!trimmedTitle) {
      notifyError("Informe o título do ticket.");
      return;
    }
    if (!requestorName.trim() || !requestorEmail.trim()) {
      notifyError("Informe solicitante (nome e e-mail).");
      return;
    }
    if (requiresCatalog && !catalogItemId) {
      notifyError("Selecione o item do catálogo.");
      return;
    }

    const exported = composerRef.current?.exportContent();
    if (!exported?.isValid) {
      notifyError("Informe a descrição do ticket.");
      return;
    }

    const ccEmails = ccEmailsInput
      .split(/[,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);

    const payload: TicketAutoOpenRulePayload = {
      name: trimmedName,
      active,
      periodicity,
      nextScheduledDate,
      scheduleTime,
      deskId: Number(deskId),
      clientId: Number(clientId),
      title: trimmedTitle,
      description: exported.description,
      requestorName: requestorName.trim(),
      requestorEmail: requestorEmail.trim(),
      requestorTelephone: requestorTelephone.trim() || undefined,
      ccEmails: ccEmails.length ? ccEmails : undefined,
      externalGmudRef: externalGmudRef.trim() || undefined,
      classificationId: classificationId ?? undefined,
      responsibleId:
        responsibleId === AUTO_OPEN_RESPONSIBLE_PRE_TICKET
          ? -1
          : responsibleId
            ? Number(responsibleId)
            : undefined,
      priorityId: priorityId ? Number(priorityId) : undefined,
      servicesCatalogsItemId: catalogItemId ? Number(catalogItemId) : undefined,
      parentTicketNumber: parentTicketNumber
        ? Number(parentTicketNumber)
        : undefined,
    };

    try {
      setSaving(true);
      if (editing) {
        await adminService.updateTicketAutoOpenRule(editing.id, payload);
      } else {
        await adminService.createTicketAutoOpenRule(payload);
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Falha ao salvar a regra.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full max-w-none flex-col gap-0 p-0 sm:max-w-none md:w-[min(1100px,92vw)]"
      >
        <SheetHeader className="shrink-0 border-b border-border px-6 py-4">
          <SheetTitle>
            {editing ? "Editar abertura automática" : "Nova abertura automática"}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2 xl:col-span-2">
              <FieldLabel required>Nome</FieldLabel>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: [ROTINAS] Validação backup"
              />
            </div>
            <div className="space-y-2">
              <FieldLabel required>Periodicidade</FieldLabel>
              <SearchableSelectField
                value={periodicity}
                onChange={(v) =>
                  setPeriodicity(v as TicketAutoOpenPeriodicity)
                }
                options={TICKET_AUTO_OPEN_PERIODICITY_OPTIONS.map((o) => ({
                  value: o.value,
                  label: o.label,
                }))}
              />
            </div>
            <div className="space-y-2">
              <FieldLabel required>Próxima data</FieldLabel>
              <DatePickerField
                value={nextScheduledDate}
                onChange={setNextScheduledDate}
                modal
              />
            </div>
            <div className="space-y-2">
              <FieldLabel required>Horário</FieldLabel>
              <Input
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <FlipCheckbox
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              Ativa
            </label>
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/10 p-4">
            <p className="mb-4 text-sm font-semibold text-foreground">
              Campos do ticket
            </p>
            {loadingCatalogs && !catalogs ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Carregando catálogos…
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <FieldLabel required>Catálogo</FieldLabel>
                  <SearchableSelectField
                    value={deskId}
                    onChange={setDeskId}
                    options={(catalogs?.desks ?? []).map((d) => ({
                      value: String(d.id),
                      label: d.name,
                    }))}
                    placeholder="Selecione"
                  />
                </div>
                <div className="space-y-2">
                  <FieldLabel required>Cliente</FieldLabel>
                  <SearchableSelectField
                    value={clientId}
                    onChange={setClientId}
                    options={(catalogs?.clients ?? []).map((c) => ({
                      value: String(c.id),
                      label: c.name,
                    }))}
                    placeholder="Selecione"
                  />
                </div>
                <div className="space-y-2">
                  <FieldLabel>Responsável</FieldLabel>
                  <SearchableSelectField
                    value={responsibleId}
                    onChange={setResponsibleId}
                    options={[
                      {
                        value: AUTO_OPEN_RESPONSIBLE_AUTO,
                        label: "Automático (criador da regra)",
                      },
                      {
                        value: AUTO_OPEN_RESPONSIBLE_PRE_TICKET,
                        label: "Sem responsável (pré-ticket)",
                      },
                      ...(catalogs?.responsibles ?? []).map((r) => ({
                        value: String(r.id),
                        label: r.name,
                      })),
                    ]}
                  />
                </div>
                <div className="space-y-2">
                  <FieldLabel>Prioridade</FieldLabel>
                  <SearchableSelectField
                    value={priorityId}
                    onChange={setPriorityId}
                    options={[
                      { value: "", label: "Padrão do catálogo" },
                      ...(catalogs?.priorities ?? []).map((p) => ({
                        value: String(p.id),
                        label: p.name,
                      })),
                    ]}
                  />
                </div>
                {(catalogs?.classification?.tree?.length ?? 0) > 0 ? (
                  <div className="lg:col-span-2">
                    <ClassificationCascadeFields
                      serviceDeskId={catalogs?.portalServiceDesk?.id ?? null}
                      tree={catalogs?.classification?.tree ?? null}
                      value={classificationId}
                      onChange={setClassificationId}
                      levelLabels={Object.fromEntries(
                        (catalogs?.classification?.levelLabels ?? []).map(
                          (item) => [item.level, item.label],
                        ),
                      )}
                    />
                  </div>
                ) : null}
                {requiresCatalog ? (
                  <div className="space-y-2 lg:col-span-2">
                    <FieldLabel required>Item do catálogo</FieldLabel>
                    <SearchableSelectField
                      value={catalogItemId}
                      onChange={setCatalogItemId}
                      options={(catalogs?.catalogItems ?? []).map((item) => ({
                        value: String(item.id),
                        label: item.name,
                      }))}
                      placeholder="Selecione"
                    />
                  </div>
                ) : null}
                <div className="space-y-2 lg:col-span-2">
                  <FieldLabel required>Título</FieldLabel>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <FieldLabel required>Solicitante</FieldLabel>
              <Input
                value={requestorName}
                onChange={(e) => setRequestorName(e.target.value)}
                placeholder="Nome"
              />
            </div>
            <div className="space-y-2">
              <FieldLabel required>E-mail solicitante</FieldLabel>
              <Input
                type="email"
                value={requestorEmail}
                onChange={(e) => setRequestorEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <FieldLabel>Telefone</FieldLabel>
              <Input
                value={requestorTelephone}
                onChange={(e) => setRequestorTelephone(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <FieldLabel>Seguidores (e-mails)</FieldLabel>
              <Input
                value={ccEmailsInput}
                onChange={(e) => setCcEmailsInput(e.target.value)}
                placeholder="email1@..., email2@..."
              />
            </div>
            <div className="space-y-2">
              <FieldLabel>GMUD</FieldLabel>
              <Input
                value={externalGmudRef}
                onChange={(e) => setExternalGmudRef(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <FieldLabel>Ticket pai (opcional)</FieldLabel>
              <Input
                value={parentTicketNumber}
                onChange={(e) => setParentTicketNumber(e.target.value)}
                placeholder="Número do ticket pai"
              />
            </div>
          </div>

          <AppointmentDescriptionComposer
            key={composerKey}
            ref={composerRef}
            disabled={saving}
            initialDescription={editing?.description ?? null}
          />
        </div>

        <SheetFooter className="!pb-4 mt-0 shrink-0 flex-row justify-end gap-2 border-t border-border bg-muted/40 px-6 py-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Salvando…
              </>
            ) : (
              "Salvar"
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
