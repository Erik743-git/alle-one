"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { gmudsService, type SearchUserResult } from "@/lib/services/gmuds.service";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId?: string;
  title?: string;
  onSelect: (user: { id: string; name: string; email: string }) => void;
};

export function UserSearchDialog({
  open,
  onOpenChange,
  companyId,
  title = "Selecionar usuário",
  onSelect,
}: Props) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchUserResult[]>([]);

  const debouncedQ = useMemo(() => q.trim(), [q]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setResults([]);
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    if (!open) return;

    async function run() {
      setLoading(true);
      setError(null);
      try {
        const data = await gmudsService.searchUsers({
          companyId,
          q: debouncedQ.length ? debouncedQ : undefined,
        });
        if (!cancelled) setResults(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erro ao buscar usuários");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [open, companyId, debouncedQ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border border-border bg-card text-card-foreground font-sans text-base sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome ou e-mail"
            className=""
          />

          {error ? <div className="alle-alert-error rounded-xl px-3 py-2 text-sm">{error}</div> : null}
          {loading ? <div className="text-sm text-muted-foreground">Buscando...</div> : null}

          <div className="max-h-[320px] space-y-2 overflow-auto rounded-xl border border-border bg-muted/40 p-2">
            {results.length === 0 && !loading ? (
              <div className="p-2 text-sm text-muted-foreground">
                Nenhum usuário encontrado.
              </div>
            ) : null}

            {results.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => {
                  onSelect({ id: user.id, name: user.name, email: user.email });
                  onOpenChange(false);
                }}
                className="w-full rounded-lg border border-border bg-background/40 p-3 text-left hover:bg-muted/40"
              >
                <div className="text-sm font-semibold">{user.name}</div>
                <div className="text-xs text-muted-foreground">{user.email}</div>
              </button>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

