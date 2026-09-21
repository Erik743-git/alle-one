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
import { usersService } from "@/lib/services/users.service";

export type PreTicketOpenChoice = {
  companyId?: string;
  specialtyId?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pergunta a empresa; false quando o remetente já foi reconhecido. */
  askCompany?: boolean;
  /** Pergunta a mesa; false quando a regra de direcionamento já definiu. */
  askDesk?: boolean;
  /** Recebe o que foi escolhido; quem chamou é que abre o chamado. */
  onConfirm: (choice: PreTicketOpenChoice) => void;
  busy?: boolean;
};

/**
 * Pergunta o que falta antes de abrir um pré-ticket.
 *
 * O remetente nem sempre é reconhecido (e-mail de alguém fora do portal,
 * domínio de empresa não cadastrada) e nem todo e-mail casa com uma regra
 * de direcionamento. Sem perguntar, o chamado nascia sem cliente ou sem
 * mesa e só dava para corrigir depois, na edição — e sem mesa ele fica
 * fora da fila da equipe e da distribuição dos relatórios.
 */
export function PreTicketCompanyDialog({
  open,
  onOpenChange,
  askCompany = true,
  askDesk = false,
  onConfirm,
  busy,
}: Props) {
  const [companies, setCompanies] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [desks, setDesks] = useState<Array<{ id: string; name: string }>>([]);
  const [companyId, setCompanyId] = useState("");
  const [specialtyId, setSpecialtyId] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setCompanyId("");
    setSpecialtyId("");

    Promise.all([
      // Lista da sessão: quem atende pré-ticket é equipe interna e nem sempre
      // tem o módulo Empresas, que o /companies exige.
      askCompany ? companiesService.listAccessible() : Promise.resolve([]),
      askDesk ? usersService.listSpecialties() : Promise.resolve([]),
    ])
      .then(([rows, specialties]) => {
        if (cancelled) return;
        setCompanies(
          rows
            .filter((row) => row.tifluxClientId != null)
            .map((row) => ({ id: row.id, name: row.name })),
        );
        setDesks(specialties.map((s) => ({ id: s.id, name: s.name })));
      })
      .catch((err) => {
        if (cancelled) return;
        notifyError(
          err instanceof Error
            ? err.message
            : "Não foi possível carregar as opções.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, askCompany, askDesk]);

  const companyOptions = useMemo(
    () =>
      companies
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
        .map((row) => ({ value: row.id, label: row.name })),
    [companies],
  );

  const deskOptions = useMemo(
    () =>
      desks
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
        .map((row) => ({ value: row.id, label: row.name })),
    [desks],
  );

  const faltaEscolher =
    (askCompany && !companyId) || (askDesk && !specialtyId);

  const titulo =
    askCompany && askDesk
      ? "Empresa e mesa do chamado"
      : askDesk
        ? "Mesa do chamado"
        : "Empresa do chamado";

  const descricao =
    askCompany && askDesk
      ? "Este e-mail não foi reconhecido nem casou com uma regra de direcionamento. Escolha a empresa e a mesa."
      : askDesk
        ? "Este e-mail não casou com nenhuma regra de direcionamento. Escolha a mesa que vai atender."
        : "O remetente deste e-mail não foi reconhecido. Escolha a empresa para o chamado não nascer sem cliente.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="font-sans max-w-md border-border bg-card text-card-foreground">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {askCompany ? (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Empresa
              </p>
              <SearchableSelectField
                value={companyId}
                onChange={setCompanyId}
                options={companyOptions}
                emptyLabel={loading ? "Carregando…" : "Selecione a empresa"}
                disabled={loading || busy}
                modal
              />
            </div>
          ) : null}

          {askDesk ? (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Mesa
              </p>
              <SearchableSelectField
                value={specialtyId}
                onChange={setSpecialtyId}
                options={deskOptions}
                emptyLabel={loading ? "Carregando…" : "Selecione a mesa"}
                disabled={loading || busy}
                modal
              />
            </div>
          ) : null}
        </div>

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
            onClick={() =>
              onConfirm({
                ...(askCompany ? { companyId } : {}),
                ...(askDesk ? { specialtyId } : {}),
              })
            }
            disabled={faltaEscolher || busy}
          >
            Abrir chamado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
