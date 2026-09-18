"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SearchableSelectField } from "@/components/ui/searchable-select-field";
import { notifyError } from "@/lib/notify";
import { companiesService } from "@/lib/services/companies.service";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Recebe a empresa escolhida; quem chamou é que abre o chamado. */
  onConfirm: (companyId: string) => void;
  busy?: boolean;
};

/**
 * Pergunta a empresa antes de abrir um pré-ticket que veio sem ela.
 *
 * O remetente nem sempre é reconhecido (e-mail de alguém que não está no
 * portal, domínio de empresa ainda não cadastrada). Antes disso o chamado
 * nascia sem cliente e só dava para corrigir depois, na edição.
 */
export function PreTicketCompanyDialog({
  open,
  onOpenChange,
  onConfirm,
  busy,
}: Props) {
  const [companies, setCompanies] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [companyId, setCompanyId] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    companiesService
      // Lista da sessão: quem atende pré-ticket é equipe interna e nem sempre
      // tem o módulo Empresas, que o /companies exige.
      .listAccessible()
      .then((rows) => {
        if (cancelled) return;
        setCompanies(
          rows
            .filter((row) => row.tifluxClientId != null)
            .map((row) => ({ id: row.id, name: row.name })),
        );
      })
      .catch((err) => {
        if (cancelled) return;
        notifyError(
          err instanceof Error
            ? err.message
            : "Não foi possível carregar as empresas.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const options = useMemo(
    () =>
      companies
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
        .map((row) => ({ value: row.id, label: row.name })),
    [companies],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="font-sans max-w-md border-border bg-card text-card-foreground">
        <DialogHeader>
          <DialogTitle>Empresa do chamado</DialogTitle>
          <DialogDescription>
            O remetente deste e-mail não foi reconhecido. Escolha a empresa
            para o chamado não nascer sem cliente.
          </DialogDescription>
        </DialogHeader>

        <SearchableSelectField
          value={companyId}
          onChange={setCompanyId}
          options={options}
          emptyLabel={loading ? "Carregando…" : "Selecione a empresa"}
          disabled={loading || busy}
        />

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => onConfirm(companyId)}
            disabled={!companyId || busy}
          >
            Abrir chamado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
