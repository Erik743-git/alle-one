"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle,
  ChevronDown,
  FolderInput,
  GitMerge,
  Loader2,
  RotateCcw,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelectField } from "@/components/ui/searchable-select-field";
import { useConfirm } from "@/lib/confirm";
import { PORTAL_STAGE } from "@/lib/portal-ticket-stages";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  ticketsService,
  type TicketListItem,
} from "@/lib/services/tickets.service";

type TicketOptionsMenuProps = {
  ticketNumber: number;
  isClosed: boolean;
  currentDeskId?: number | null;
  disabled?: boolean;
  onChanged: (patch?: TicketOptionsChange) => Promise<void> | void;
};

export type TicketOptionsChange = {
  isClosed?: boolean;
  stageName?: string;
  statusName?: string;
  deskName?: string;
  deskExternalId?: number | null;
};

function flattenTickets(
  groups: Array<{ tickets: TicketListItem[] }>,
): TicketListItem[] {
  return groups.flatMap((group) => group.tickets);
}

export function TicketOptionsMenu({
  ticketNumber,
  isClosed,
  currentDeskId,
  disabled = false,
  onChanged,
}: TicketOptionsMenuProps) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [deskId, setDeskId] = useState("");
  const [deskOptions, setDeskOptions] = useState<
    Array<{ value: string; label: string }>
  >([]);
  const [loadingDesks, setLoadingDesks] = useState(false);
  const [responsibleId, setResponsibleId] = useState("");
  const [responsibleOptions, setResponsibleOptions] = useState<
    Array<{ value: string; label: string }>
  >([]);
  const [loadingResponsibles, setLoadingResponsibles] = useState(false);
  const [groupQuery, setGroupQuery] = useState("");
  const [groupResults, setGroupResults] = useState<TicketListItem[]>([]);
  const [groupSearching, setGroupSearching] = useState(false);
  const [selectedParent, setSelectedParent] = useState<TicketListItem | null>(
    null,
  );

  const currentDeskValue = useMemo(
    () => (currentDeskId != null ? String(currentDeskId) : ""),
    [currentDeskId],
  );

  async function runLifecycle(
    title: string,
    description: string,
    confirmText: string,
    payload: {
      isClosed: boolean;
      stageName: string;
      statusName: string;
    },
    successMessage: string,
    variant?: "error",
  ) {
    const ok = await confirm({
      title,
      description,
      confirmText,
      ...(variant ? { variant } : {}),
    });
    if (!ok) return;
    try {
      setBusy(true);
      await ticketsService.updateTicket(ticketNumber, payload);
      notifySuccess(successMessage);
      await onChanged({
        isClosed: payload.isClosed,
        stageName: payload.stageName,
        statusName: payload.statusName,
      });
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível concluir a ação.",
      );
    } finally {
      setBusy(false);
    }
  }

  function handleCloseTicket() {
    return runLifecycle(
      "Fechar Ticket?",
      "o ticket será marcado como Encerrado e sai da fila de pendentes. Se precisar, use Reabrir depois.",
      "Fechar Ticket",
      {
        isClosed: true,
        stageName: PORTAL_STAGE.ENCERRADO,
        statusName: PORTAL_STAGE.ENCERRADO,
      },
      "Ticket encerrado.",
    );
  }

  function handleCancelTicket() {
    return runLifecycle(
      "Cancelar Ticket?",
      "o ticket será marcado como Cancelado e encerrado. Essa ação pode ser desfeita com Reabrir.",
      "Cancelar Ticket",
      {
        isClosed: true,
        stageName: PORTAL_STAGE.CANCELADO,
        statusName: PORTAL_STAGE.CANCELADO,
      },
      "Ticket cancelado.",
      "error",
    );
  }

  function handleReopenTicket() {
    return runLifecycle(
      "Reabrir Ticket?",
      "o ticket volta para o estágio Novo e poderá ser editado novamente.",
      "Reabrir",
      {
        isClosed: false,
        stageName: PORTAL_STAGE.NOVO,
        statusName: PORTAL_STAGE.NOVO,
      },
      "Ticket reaberto.",
    );
  }

  async function openTransferDialog() {
    setTransferOpen(true);
    setDeskId(currentDeskValue);
    setResponsibleId("");
    setResponsibleOptions([]);
    setLoadingDesks(true);
    try {
      const catalogs = await ticketsService.createCatalogs();
      setDeskOptions(
        (catalogs.desks ?? []).map((desk) => ({
          value: String(desk.id),
          label: desk.name,
        })),
      );
    } catch (err) {
      notifyError(
        err instanceof Error
          ? err.message
          : "Não foi possível carregar os catálogos.",
      );
      setTransferOpen(false);
    } finally {
      setLoadingDesks(false);
    }
  }

  async function loadResponsiblesForDesk(nextDeskId: string) {
    const parsed = Number(nextDeskId);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setResponsibleId("");
      setResponsibleOptions([]);
      return;
    }
    setLoadingResponsibles(true);
    try {
      const catalogs = await ticketsService.createCatalogs({ deskId: parsed });
      const options = (catalogs.responsibles ?? []).map((row) => ({
        value: String(row.id),
        label: row.name,
      }));
      setResponsibleOptions(options);
      setResponsibleId(options.length === 1 ? options[0]!.value : "");
    } catch (err) {
      setResponsibleOptions([]);
      setResponsibleId("");
      notifyError(
        err instanceof Error
          ? err.message
          : "Não foi possível carregar os responsáveis da mesa.",
      );
    } finally {
      setLoadingResponsibles(false);
    }
  }

  useEffect(() => {
    if (!transferOpen || !deskId || deskId === currentDeskValue) {
      if (!transferOpen || !deskId) {
        setResponsibleId("");
        setResponsibleOptions([]);
      }
      return;
    }
    void loadResponsiblesForDesk(deskId);
  }, [transferOpen, deskId, currentDeskValue]);

  async function confirmTransfer() {
    const nextDeskId = Number(deskId);
    if (!Number.isFinite(nextDeskId) || nextDeskId <= 0) {
      notifyError("Selecione o catálogo de destino.");
      return;
    }
    if (String(nextDeskId) === currentDeskValue) {
      notifyError("Selecione um catálogo diferente do atual.");
      return;
    }
    if (responsibleOptions.length > 0 && !responsibleId) {
      notifyError("Selecione o responsável da mesa de destino.");
      return;
    }
    const deskLabel =
      deskOptions.find((row) => row.value === deskId)?.label ?? deskId;
    const responsibleLabel =
      responsibleOptions.find((row) => row.value === responsibleId)?.label ??
      null;
    const ok = await confirm({
      title: "Transferir Ticket?",
      description: responsibleLabel
        ? `o ticket sai da fila atual, vai para "${deskLabel}" e o responsável passa a ser "${responsibleLabel}".`
        : `o ticket sai da fila atual e vai para "${deskLabel}".`,
      confirmText: "Transferir",
    });
    if (!ok) return;
    try {
      setBusy(true);
      const res = await ticketsService.updateTicket(ticketNumber, {
        deskId: nextDeskId,
        ...(responsibleId ? { responsibleId: Number(responsibleId) } : {}),
      });
      notifySuccess(res.message);
      setTransferOpen(false);
      await onChanged({
        deskName: deskLabel,
        deskExternalId: nextDeskId,
      });
    } catch (err) {
      notifyError(
        err instanceof Error
          ? err.message
          : "Não foi possível transferir o ticket.",
      );
    } finally {
      setBusy(false);
    }
  }

  function openGroupDialog() {
    setGroupQuery("");
    setGroupResults([]);
    setSelectedParent(null);
    setGroupOpen(true);
  }

  async function searchParentTickets() {
    const raw = groupQuery.trim();
    if (!raw) {
      notifyError("Informe o número ou trecho do título do ticket pai.");
      return;
    }
    setGroupSearching(true);
    try {
      const parsed = Number(raw);
      const list = await ticketsService.list({
        mineOnly: false,
        includeDone: true,
        limit: 20,
        ...(Number.isFinite(parsed) && parsed > 0
          ? { ticketNumber: parsed }
          : { search: raw }),
      });
      const rows = flattenTickets(list.groups ?? []).filter(
        (row) => row.ticketNumber !== ticketNumber,
      );
      setGroupResults(rows);
      setSelectedParent(rows.length === 1 ? rows[0] : null);
      if (rows.length === 0) {
        notifyError("Nenhum ticket encontrado para agrupar.");
      }
    } catch (err) {
      notifyError(
        err instanceof Error
          ? err.message
          : "Não foi possível buscar o ticket pai.",
      );
    } finally {
      setGroupSearching(false);
    }
  }

  async function confirmGroup() {
    if (!selectedParent) {
      notifyError("Selecione o ticket pai.");
      return;
    }
    const ok = await confirm({
      title: "Agrupar Ticket?",
      description: `Este ticket (#${ticketNumber}) será cancelado e mesclado no #${selectedParent.ticketNumber}. O pai continua aberto.`,
      confirmText: "Agrupar",
    });
    if (!ok) return;
    try {
      setBusy(true);
      const res = await ticketsService.groupTicket(
        ticketNumber,
        selectedParent.ticketNumber,
      );
      notifySuccess(res.message);
      setGroupOpen(false);
      await onChanged({
        isClosed: true,
        stageName: PORTAL_STAGE.CANCELADO,
        statusName: PORTAL_STAGE.CANCELADO,
      });
    } catch (err) {
      notifyError(
        err instanceof Error
          ? err.message
          : "Não foi possível agrupar o ticket.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || busy}
          >
            {busy ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <ChevronDown className="mr-2 size-4" />
            )}
            Opções
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {!isClosed ? (
            <>
              <DropdownMenuItem
                disabled={busy}
                onSelect={() => void handleCloseTicket()}
              >
                <CheckCircle className="size-4" />
                Fechar Ticket
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                disabled={busy}
                onSelect={() => void handleCancelTicket()}
              >
                <XCircle className="size-4" />
                Cancelar Ticket
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={busy}
                onSelect={() => void openTransferDialog()}
              >
                <FolderInput className="size-4" />
                Transferir Ticket
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={busy}
                onSelect={() => openGroupDialog()}
              >
                <GitMerge className="size-4" />
                Agrupar Ticket
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem
              disabled={busy}
              onSelect={() => void handleReopenTicket()}
            >
              <RotateCcw className="size-4" />
              Reabrir Ticket
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Transferir Ticket</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Catálogo de destino</Label>
            <SearchableSelectField
              value={deskId}
              onChange={(value) => {
                setDeskId(value);
                setResponsibleId("");
                setResponsibleOptions([]);
              }}
              options={deskOptions}
              loading={loadingDesks}
              placeholder="Selecione o catálogo"
            />
            <p className="text-xs text-muted-foreground">
              Use para passar o ticket de Infra para Sistemas, por exemplo.
            </p>
            {deskId && deskId !== currentDeskValue ? (
              <div className="space-y-2 pt-2">
                <Label>Responsável na mesa de destino</Label>
                <SearchableSelectField
                  value={responsibleId}
                  onChange={setResponsibleId}
                  options={responsibleOptions}
                  loading={loadingResponsibles}
                  placeholder={
                    loadingResponsibles
                      ? "Carregando responsáveis…"
                      : responsibleOptions.length === 0
                        ? "Nenhum responsável nesta especialidade"
                        : "Selecione o responsável"
                  }
                  disabled={loadingResponsibles || responsibleOptions.length === 0}
                />
                <p className="text-xs text-muted-foreground">
                  Lista filtrada pela especialidade da mesa selecionada.
                </p>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setTransferOpen(false)}
            >
              Voltar
            </Button>
            <Button
              type="button"
              disabled={
                busy ||
                loadingDesks ||
                loadingResponsibles ||
                !deskId ||
                (responsibleOptions.length > 0 && !responsibleId)
              }
              onClick={() => void confirmTransfer()}
            >
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Transferir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={groupOpen} onOpenChange={setGroupOpen}>
        <DialogContent
          className="flex max-h-[min(88vh,560px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
          showCloseButton
        >
          <DialogHeader className="shrink-0 space-y-2 px-4 pt-4 pr-12">
            <DialogTitle>Agrupar Ticket</DialogTitle>
            <DialogDescription className="sr-only">
              Escolha o ticket pai que permanece aberto. O chamado atual será
              encerrado.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
            <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 text-sm">
              <p className="font-medium text-amber-50">
                Atenção: o chamado atual (#{ticketNumber}) será encerrado.
              </p>
              <p className="mt-1 text-xs leading-relaxed text-amber-100/85">
                Busque e selecione o ticket pai que permanece aberto. No Alle
                One você escolhe qual chamado manter — diferente do TiFlux, onde
                se escolhe qual encerrar.
              </p>
            </div>
            <div className="flex min-w-0 gap-2">
              <Input
                value={groupQuery}
                onChange={(event) => setGroupQuery(event.target.value)}
                placeholder="Número ou título do ticket pai"
                className="h-11 min-w-0"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void searchParentTickets();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                className="h-11 shrink-0"
                disabled={groupSearching}
                onClick={() => void searchParentTickets()}
              >
                {groupSearching ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : null}
                Buscar
              </Button>
            </div>
            {groupResults.length > 0 ? (
              <ul className="max-h-52 space-y-1 overflow-y-auto overflow-x-hidden rounded-md border border-border bg-card/40 p-1">
                {groupResults.map((row) => {
                  const selected = selectedParent?.ticketNumber === row.ticketNumber;
                  return (
                    <li key={row.ticketNumber}>
                      <button
                        type="button"
                        className={
                          selected
                            ? "w-full rounded-md bg-primary/10 px-3 py-2 text-left text-sm ring-1 ring-primary/30"
                            : "w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted/60"
                        }
                        onClick={() => setSelectedParent(row)}
                      >
                        <span className="font-medium">#{row.ticketNumber}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          · {row.stageName ?? "—"} · {row.clientName ?? "—"}
                        </span>
                        <span className="mt-0.5 block truncate">
                          {row.title ?? "Sem título"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
          <DialogFooter className="mx-0 shrink-0 rounded-none border-t bg-muted/50 px-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setGroupOpen(false)}
            >
              Voltar
            </Button>
            <Button
              type="button"
              disabled={busy || !selectedParent}
              onClick={() => void confirmGroup()}
            >
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Agrupar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
