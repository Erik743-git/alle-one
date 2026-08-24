"use client";

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { Search } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldLabel } from "@/components/ui/field-label";
import { ticketsService } from "@/lib/services/tickets.service";
import { cn } from "@/lib/utils";

export type TicketFollowerPerson = {
  email: string;
  name?: string;
};

type CatalogPerson = {
  name: string;
  email?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selected: TicketFollowerPerson[];
  requestors?: CatalogPerson[];
  responsibles?: CatalogPerson[];
  excludeEmails?: Array<string | null | undefined>;
  onAdd: (person: TicketFollowerPerson) => void;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function collectLocalCandidates(
  requestors: CatalogPerson[],
  responsibles: CatalogPerson[],
): TicketFollowerPerson[] {
  const map = new Map<string, TicketFollowerPerson>();
  for (const row of [...requestors, ...responsibles]) {
    const email = normalizeEmail(row.email);
    if (!email) continue;
    if (!map.has(email)) {
      map.set(email, { email, name: row.name.trim() || undefined });
    }
  }
  return [...map.values()].sort((a, b) =>
    (a.name ?? a.email).localeCompare(b.name ?? b.email, "pt-BR"),
  );
}

function matchesQuery(person: TicketFollowerPerson, query: string): boolean {
  if (!query) return true;
  const haystack = `${person.name ?? ""} ${person.email}`.toLowerCase();
  return haystack.includes(query.toLowerCase());
}

export function TicketFollowersDialog({
  open,
  onOpenChange,
  ...panelProps
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-3 overflow-hidden p-4 sm:max-w-md">
        {open ? <TicketFollowersPanel key="open" {...panelProps} /> : (
          <>
            <DialogHeader>
              <DialogTitle>Seguidores</DialogTitle>
            </DialogHeader>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TicketFollowersPanel({
  selected,
  requestors = [],
  responsibles = [],
  excludeEmails = [],
  onAdd,
}: Omit<Props, "open" | "onOpenChange">) {
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<TicketFollowerPerson[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const blocked = useMemo(() => {
    const set = new Set(
      [
        ...selected.map((p) => p.email),
        ...excludeEmails.map((e) => normalizeEmail(e)),
      ]
        .map((e) => normalizeEmail(e))
        .filter(Boolean),
    );
    return set;
  }, [selected, excludeEmails]);

  const localCandidates = useMemo(
    () => collectLocalCandidates(requestors, responsibles),
    [requestors, responsibles],
  );

  const term = query.trim();
  const remoteResults = term.length < 2 ? [] : remote;

  useEffect(() => {
    if (term.length < 2) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearching(true);
      void ticketsService
        .searchUsers(term)
        .then((rows) => {
          if (cancelled) return;
          setRemote(
            rows.map((row) => ({
              email: normalizeEmail(row.email),
              name: row.name?.trim() || undefined,
            })),
          );
        })
        .catch(() => {
          if (!cancelled) setRemote([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [term]);

  const suggestions = useMemo(() => {
    const map = new Map<string, TicketFollowerPerson>();
    for (const person of [...localCandidates, ...remoteResults]) {
      const email = normalizeEmail(person.email);
      if (!email || blocked.has(email)) continue;
      if (!matchesQuery(person, term)) continue;
      if (!map.has(email)) map.set(email, { ...person, email });
    }
    return [...map.values()].slice(0, 40);
  }, [blocked, localCandidates, remoteResults, term]);

  const typedEmail = normalizeEmail(query);
  const canAddTypedEmail =
    EMAIL_RE.test(typedEmail) &&
    !blocked.has(typedEmail) &&
    !suggestions.some((p) => p.email === typedEmail);

  const list = useMemo(() => {
    if (!canAddTypedEmail) return suggestions;
    return [{ email: typedEmail, name: typedEmail }, ...suggestions];
  }, [canAddTypedEmail, suggestions, typedEmail]);

  const highlightIndex =
    list.length === 0 ? 0 : Math.min(activeIndex, list.length - 1);

  function addPerson(person: TicketFollowerPerson) {
    const email = normalizeEmail(person.email);
    if (!email || !EMAIL_RE.test(email)) return;
    onAdd({
      email,
      name: person.name && person.name !== email ? person.name : undefined,
    });
    setQuery("");
    setRemote([]);
    setActiveIndex(0);
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    setActiveIndex(0);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(list.length - 1, 0)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const chosen = list[highlightIndex];
      if (chosen) addPerson(chosen);
    }
  }

  return (
    <>
      <DialogHeader className="pr-8">
        <DialogTitle>Seguidores</DialogTitle>
        <DialogDescription className="sr-only">
          Adicione pessoas que recebem as atualizações do Ticket por e-mail.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2">
        <FieldLabel htmlFor="ticket-follower-search">
          Adicionar seguidores
        </FieldLabel>
        <div className="relative">
          <input
            id="ticket-follower-search"
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Selecione ou digite um e-mail"
            autoComplete="off"
            autoFocus
            className="h-10 w-full rounded-lg border border-input bg-transparent py-2 pr-9 pl-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400/40 dark:bg-input/30"
          />
          <Search className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>

      <div className="max-h-72 overflow-y-auto rounded-lg border border-border bg-background">
        <div className="sticky top-0 z-10 border-b border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground">
          Seguidor
        </div>
        {list.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            {searching
              ? "Buscando..."
              : term
                ? "Nenhum contato encontrado. Digite um e-mail e pressione Enter."
                : "Digite um nome ou e-mail para buscar."}
          </p>
        ) : (
          <ul className="py-1">
            {list.map((person, index) => {
              const isTypedEmail =
                canAddTypedEmail && person.email === typedEmail && index === 0;
              return (
                <li key={`${person.email}-${index}`}>
                  <button
                    type="button"
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => addPerson(person)}
                    className={cn(
                      "flex w-full flex-col items-start px-3 py-2 text-left",
                      index === highlightIndex
                        ? "bg-muted"
                        : "hover:bg-muted/60",
                    )}
                  >
                    <span className="text-sm font-medium text-foreground">
                      {isTypedEmail
                        ? `Adicionar ${person.email}`
                        : person.name || person.email}
                    </span>
                    {!isTypedEmail && person.name ? (
                      <span className="text-xs text-muted-foreground">
                        {person.email}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
