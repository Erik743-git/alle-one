"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2, Search, Ticket, User } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { canAccessTickets } from "@/lib/access-control";
import {
  ticketsService,
  type QuickSearchResult,
} from "@/lib/services/tickets.service";

type Row =
  | { kind: "ticket"; key: string; label: string; hint: string; href: string }
  | { kind: "company"; key: string; label: string; hint: string; href: string }
  | {
      kind: "collaborator";
      key: string;
      label: string;
      hint: string;
      href: string;
    };

const EMPTY: QuickSearchResult = {
  tickets: [],
  companies: [],
  collaborators: [],
};

/**
 * Paleta de busca (Ctrl+K / Cmd+K). Achar o ticket #79151 exigia entrar em
 * Tickets, marcar "incluir encerrados" e buscar — agora é de qualquer tela.
 *
 * O escopo é decidido no backend: usuário de cliente só encontra tickets da
 * própria empresa e não vê empresas nem colaboradores.
 */
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [result, setResult] = useState<QuickSearchResult>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const seqRef = useRef(0);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => {
          if (current) {
            seqRef.current += 1;
            setTerm("");
            setResult(EMPTY);
            setHighlighted(0);
            setLoading(false);
          }
          return !current;
        });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Reset no fechamento (e não num efeito sobre `open`, que dispararia
  // render em cascata).
  const setOpenAndReset = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) {
      seqRef.current += 1;
      setTerm("");
      setResult(EMPTY);
      setHighlighted(0);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const query = term.trim();
    // Termo curto: não busca. O resultado antigo fica ignorado pelo `rows`,
    // que também exige 2 letras — evita limpar estado dentro do efeito.
    if (query.length < 2) return;
    const seq = ++seqRef.current;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void ticketsService
        .quickSearch(query)
        .then((data) => {
          if (seq !== seqRef.current) return;
          setResult(data);
          setHighlighted(0);
        })
        .catch(() => {
          if (seq !== seqRef.current) return;
          setResult(EMPTY);
        })
        .finally(() => {
          if (seq === seqRef.current) setLoading(false);
        });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [term]);

  const rows = useMemo((): Row[] => {
    if (term.trim().length < 2) return [];
    const list: Row[] = [];
    for (const ticket of result.tickets) {
      list.push({
        kind: "ticket",
        key: `t-${ticket.ticketNumber}`,
        label: `#${ticket.ticketNumber} · ${ticket.title?.trim() || "sem título"}`,
        hint: [ticket.clientName, ticket.stageName]
          .filter(Boolean)
          .join(" · "),
        href: `/tickets/${ticket.ticketNumber}`,
      });
    }
    for (const company of result.companies) {
      list.push({
        kind: "company",
        key: `c-${company.id}`,
        label: company.name,
        hint: "Empresa",
        href: `/admin/empresas?companyId=${company.id}`,
      });
    }
    for (const person of result.collaborators) {
      list.push({
        kind: "collaborator",
        key: `u-${person.id}`,
        label: person.name,
        hint: person.email,
        href: `/apontamentos/${person.id}`,
      });
    }
    return list;
  }, [result, term]);

  const go = useCallback(
    (row: Row | undefined) => {
      if (!row) return;
      setOpenAndReset(false);
      router.push(row.href);
    },
    [router, setOpenAndReset],
  );

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((i) => (rows.length ? (i + 1) % rows.length : 0));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((i) =>
        rows.length ? (i - 1 + rows.length) % rows.length : 0,
      );
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      go(rows[highlighted]);
    }
  }

  if (!canAccessTickets()) return null;

  return (
    <Dialog open={open} onOpenChange={setOpenAndReset}>
      <DialogContent className="font-sans max-w-xl gap-0 overflow-hidden p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Busca rápida</DialogTitle>
          <DialogDescription>
            Procure por ticket, empresa ou colaborador.
          </DialogDescription>
        </DialogHeader>

        <div className="relative border-b border-border">
          <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          {loading ? (
            <Loader2 className="absolute right-4 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : null}
          <Input
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Buscar ticket, empresa ou colaborador..."
            className="h-14 border-0 pl-11 text-base shadow-none focus-visible:ring-0"
          />
        </div>

        <div className="max-h-[min(60vh,420px)] overflow-y-auto p-2">
          {term.trim().length < 2 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              Digite ao menos 2 letras. Use o número do ticket para ir direto.
            </p>
          ) : rows.length === 0 && !loading ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              Nada encontrado para “{term.trim()}”.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {rows.map((row, index) => (
                <li key={row.key}>
                  <button
                    type="button"
                    onClick={() => go(row)}
                    onMouseEnter={() => setHighlighted(index)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm",
                      index === highlighted
                        ? "bg-muted text-foreground"
                        : "text-foreground/90 hover:bg-muted/60",
                    )}
                  >
                    <span className="text-muted-foreground">
                      {row.kind === "ticket" ? (
                        <Ticket className="size-4" />
                      ) : row.kind === "company" ? (
                        <Building2 className="size-4" />
                      ) : (
                        <User className="size-4" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {row.label}
                      </span>
                      {row.hint ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {row.hint}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-border bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
          <span>↑↓ navegar</span>
          <span>Enter abrir</span>
          <span>Esc fechar</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
