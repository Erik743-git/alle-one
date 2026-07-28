"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import ProtectedPage from "@/components/auth/protected-page";
import AppShell from "@/components/layout/app-shell";
import {
  PreTicketsBadge,
  refreshPreTicketsBadge,
} from "@/components/layout/pre-tickets-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  emailInboundService,
  type PreTicketListItem,
} from "@/lib/services/email-inbound.service";
import { Check, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PreTicketsPage() {
  const router = useRouter();
  const [items, setItems] = useState<PreTicketListItem[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await emailInboundService.listPreTickets(q);
      setItems(rows);
      setError(null);
      refreshPreTicketsBadge();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao listar");
    }
  }, [q]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(id: string) {
    setBusy(true);
    try {
      await emailInboundService.deletePreTicket(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao remover");
    } finally {
      setBusy(false);
    }
  }

  async function openTicket(id: string) {
    setBusy(true);
    try {
      const r = await emailInboundService.openPreTicket(id);
      router.push(`/tickets/${r.ticketNumber}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao abrir ticket");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ProtectedPage>
      <AppShell>
        <div className="mx-auto w-full max-w-5xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="flex items-center text-2xl font-semibold">
                Pré-tickets
                <PreTicketsBadge />
              </h1>
              <p className="text-sm text-muted-foreground">
                Caixa geral ({items.length})
              </p>
            </div>
            <div className="flex gap-2">
              <Input
                className="w-48"
                placeholder="Buscar"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <Button variant="outline" asChild>
                <Link href="/tickets">Voltar aos tickets</Link>
              </Button>
            </div>
          </div>

          {error ? (
            <p className="text-sm text-amber-600 dark:text-amber-400">{error}</p>
          ) : null}

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-[32%]" />
                <col className="w-[28%]" />
                <col className="w-[16%]" />
                <col className="w-[14%]" />
                <col className="w-[6%]" />
                <col className="w-[7%]" />
              </colgroup>
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Título</th>
                  <th className="px-3 py-2 font-medium">Solicitante</th>
                  <th className="px-3 py-2 font-medium">Cliente</th>
                  <th className="px-3 py-2 font-medium">Criado</th>
                  <th className="px-2 py-2 text-center font-medium">Arq.</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer border-b align-top hover:bg-muted/25"
                    onClick={() => router.push(`/tickets/pre-tickets/${row.id}`)}
                  >
                    <td className="px-3 py-2">
                      <span
                        className="line-clamp-2 font-medium text-teal-600 dark:text-teal-400"
                        title={row.title}
                      >
                        {row.title}
                      </span>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {row.channel}
                        {row.mailboxAddress ? ` · ${row.mailboxAddress}` : ""}
                      </p>
                    </td>
                    <td className="px-3 py-2">
                      <div className="truncate" title={row.fromName ?? undefined}>
                        {row.fromName ?? "—"}
                      </div>
                      <div
                        className="truncate text-[11px] text-muted-foreground"
                        title={row.fromEmail}
                      >
                        {row.fromEmail}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className="line-clamp-2"
                        title={row.company?.name ?? undefined}
                      >
                        {row.company?.name ?? "—"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                      {formatWhen(row.receivedAt)}
                    </td>
                    <td className="px-2 py-2 pr-4 text-center tabular-nums text-muted-foreground">
                      {row.attachmentCount}
                    </td>
                    <td
                      className="py-1.5 pl-3 pr-1"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          disabled={busy}
                          title="Abrir ticket"
                          onClick={() => void openTicket(row.id)}
                        >
                          <Check className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          disabled={busy}
                          title="Remover"
                          onClick={() => void remove(row.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-muted-foreground">
                      Nenhum pré-ticket pendente.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </AppShell>
    </ProtectedPage>
  );
}
