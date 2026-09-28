"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { SearchableSelectField } from "@/components/ui/searchable-select-field";
import { formatDateTime } from "@/lib/date-utils";
import { notifyError } from "@/lib/notify";
import {
  agruparParados,
  filtrarParados,
  formatarTempoParado,
  opcoesFiltro,
  totaisParados,
  type ChamadoParado,
  type Visao,
} from "@/lib/painel-chamados";
import { painelChamadosService } from "@/lib/services/painel-chamados.service";
import { cn } from "@/lib/utils";

/**
 * Chamados abertos em que ninguém mexeu desde a abertura: nenhum apontamento,
 * comunicação, troca de estágio ou de responsável. Rotina fica fora; chamado
 * sem responsável entra. Do mais antigo para o mais novo. Só admin.
 */
export function ChamadosParadosAba() {
  const router = useRouter();
  const [linhas, setLinhas] = useState<ChamadoParado[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [visao, setVisao] = useState<Visao>("empresa");
  const [empresa, setEmpresa] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [so48h, setSo48h] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await painelChamadosService.parados();
      setLinhas(r.linhas);
    } catch (e) {
      notifyError(
        e instanceof Error ? e.message : "Não foi possível carregar os chamados parados.",
      );
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const visiveis = useMemo(
    () => filtrarParados(linhas, { empresa, responsavel, so48h }),
    [linhas, empresa, responsavel, so48h],
  );
  const totais = totaisParados(visiveis);
  const grupos = useMemo(() => agruparParados(visiveis, visao), [visiveis, visao]);
  const opcoesEmpresa = useMemo(() => opcoesFiltro(linhas, "empresa"), [linhas]);
  const opcoesResponsavel = useMemo(
    () => opcoesFiltro(linhas, "responsavel"),
    [linhas],
  );

  async function exportar() {
    setExportando(true);
    try {
      await painelChamadosService.exportarParados({ empresa, responsavel, so48h });
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Não foi possível exportar.");
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Contador rotulo="Chamados parados" valor={totais.total} />
        <Contador rotulo="Mais de 48h" valor={totais.mais48h} destaque />
        <Contador rotulo="Sem responsável" valor={totais.semResponsavel} />
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="inline-flex rounded-lg border border-border p-0.5">
              {(
                [
                  ["empresa", "Por empresa"],
                  ["responsavel", "Por responsável"],
                ] as const
              ).map(([id, rotulo]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setVisao(id)}
                  className={cn(
                    "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                    visao === id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {rotulo}
                </button>
              ))}
            </div>
            <SearchableSelectField
              value={empresa}
              onChange={setEmpresa}
              options={opcoesEmpresa}
              placeholder="Empresa"
              emptyLabel="Todas as empresas"
              preserveOrder
              alwaysShowSearch
              className="w-full sm:w-64"
            />
            <SearchableSelectField
              value={responsavel}
              onChange={setResponsavel}
              options={opcoesResponsavel}
              placeholder="Responsável"
              emptyLabel="Todos os responsáveis"
              preserveOrder
              alwaysShowSearch
              className="w-full sm:w-64"
            />
            <label className="flex h-10 items-center gap-2 text-sm text-foreground">
              <Switch
                checked={so48h}
                onCheckedChange={setSo48h}
                aria-label="Só os com mais de 48h"
              />
              Só com mais de 48h
            </label>
            <div className="ml-auto flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void carregar()}
                disabled={carregando}
              >
                <RefreshCw className="mr-2 size-4" />
                Atualizar
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void exportar()}
                disabled={exportando || visiveis.length === 0}
              >
                {exportando ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Download className="mr-2 size-4" />
                )}
                Exportar Excel
              </Button>
            </div>
          </div>

          {carregando ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : grupos.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum chamado parado com esses filtros.
            </p>
          ) : (
            <div className="space-y-6">
              {grupos.map((g) => (
                <section key={g.chave} className="space-y-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-semibold text-foreground">{g.nome}</h3>
                    <p className="text-xs text-muted-foreground">
                      {g.linhas.length} parado{g.linhas.length === 1 ? "" : "s"}
                      {g.mais48h > 0 ? ` · ${g.mais48h} com mais de 48h` : ""}
                    </p>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full min-w-[760px] text-left font-sans text-sm">
                      <thead className="bg-muted/30 text-muted-foreground">
                        <tr>
                          {["Nº", "Título", "Cliente", "Responsável", "Aberto em", "Tempo parado"].map(
                            (c) => (
                              <th key={c} className="px-4 py-3 text-xs font-semibold uppercase">
                                {c}
                              </th>
                            ),
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {g.linhas.map((l) => (
                          <tr
                            key={l.ticketNumber}
                            onClick={() => router.push(`/tickets/${l.ticketNumber}`)}
                            className="cursor-pointer border-t border-border hover:bg-muted/20"
                          >
                            <td className="px-4 py-3 font-medium text-foreground">
                              #{l.ticketNumber}
                            </td>
                            <td className="px-4 py-3 text-foreground">{l.titulo ?? "—"}</td>
                            <td className="px-4 py-3 text-muted-foreground">{l.empresa}</td>
                            <td
                              className={cn(
                                "px-4 py-3",
                                l.semResponsavel
                                  ? "italic text-muted-foreground"
                                  : "text-muted-foreground",
                              )}
                            >
                              {l.responsavel}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {formatDateTime(l.abertoEm)}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={cn(
                                  "rounded-md px-2 py-0.5 text-xs font-medium",
                                  l.mais48h
                                    ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
                                    : "text-muted-foreground",
                                )}
                              >
                                {formatarTempoParado(l.horasParado)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Contador({
  rotulo,
  valor,
  destaque = false,
}: {
  rotulo: string;
  valor: number;
  destaque?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase text-muted-foreground">{rotulo}</p>
        <p
          className={cn(
            "mt-1 text-2xl font-semibold",
            destaque && valor > 0
              ? "text-amber-700 dark:text-amber-300"
              : "text-foreground",
          )}
        >
          {valor}
        </p>
      </CardContent>
    </Card>
  );
}
