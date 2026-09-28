"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { formatDateTime } from "@/lib/date-utils";
import { notifyError } from "@/lib/notify";
import type {
  ChamadoDoGrupo,
  GrupoResumo,
  Visao,
} from "@/lib/painel-chamados";
import { painelChamadosService } from "@/lib/services/painel-chamados.service";
import { cn } from "@/lib/utils";

type Totais = { abertos: number; parados48h: number; fechadosNoMes: number };

/**
 * Quantos chamados cada empresa ou responsável (terceiro incluído) tem em
 * aberto, e quantos estão parados há mais de 48h — a mesma conta da aba
 * "Chamados parados". Clicar no nome mostra quais são. Só admin.
 */
export function ChamadosPorResponsavelAba() {
  const router = useRouter();
  const [visao, setVisao] = useState<Visao>("responsavel");
  const [incluirFechados, setIncluirFechados] = useState(false);
  const [grupos, setGrupos] = useState<GrupoResumo[]>([]);
  const [totais, setTotais] = useState<Totais | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState<GrupoResumo | null>(null);
  const [lista, setLista] = useState<ChamadoDoGrupo[]>([]);
  const [carregandoLista, setCarregandoLista] = useState(false);
  const [exportando, setExportando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setAberto(null);
    setLista([]);
    try {
      const r = await painelChamadosService.resumo(visao, incluirFechados);
      setGrupos(r.grupos);
      setTotais(r.totais);
    } catch (e) {
      notifyError(
        e instanceof Error ? e.message : "Não foi possível carregar o resumo.",
      );
    } finally {
      setCarregando(false);
    }
  }, [visao, incluirFechados]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function abrirGrupo(g: GrupoResumo) {
    setAberto(g);
    setCarregandoLista(true);
    try {
      setLista(await painelChamadosService.chamados(visao, g.chave, incluirFechados));
    } catch (e) {
      notifyError(
        e instanceof Error ? e.message : "Não foi possível carregar os chamados.",
      );
    } finally {
      setCarregandoLista(false);
    }
  }

  async function exportar() {
    setExportando(true);
    try {
      // Com um nome aberto, exporta só os chamados dele; sem, todos.
      await painelChamadosService.exportarChamados(
        visao,
        aberto?.chave ?? null,
        incluirFechados,
      );
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Não foi possível exportar.");
    } finally {
      setExportando(false);
    }
  }

  const rotuloGrupo = visao === "empresa" ? "Empresa" : "Responsável";

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-lg border border-border p-0.5">
              {(
                [
                  ["responsavel", "Por responsável"],
                  ["empresa", "Por empresa"],
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
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Switch
                checked={incluirFechados}
                onCheckedChange={setIncluirFechados}
                aria-label="Incluir fechados"
              />
              Incluir fechados (mês atual)
            </label>
            {totais ? (
              <p className="text-sm text-muted-foreground">
                {totais.abertos} abertos · {totais.parados48h} parados há mais de 48h
                {incluirFechados ? ` · ${totais.fechadosNoMes} fechados no mês` : ""}
              </p>
            ) : null}
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
                disabled={exportando || grupos.length === 0}
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
              Nenhum chamado.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[560px] text-left font-sans text-sm">
                <thead className="bg-muted/30 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-xs font-semibold uppercase">{rotuloGrupo}</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase">
                      Abertos
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase">
                      Parados +48h
                    </th>
                    {incluirFechados ? (
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase">
                        Fechados no mês
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {grupos.map((g) => (
                    <tr
                      key={g.chave}
                      onClick={() => void abrirGrupo(g)}
                      className={cn(
                        "cursor-pointer border-t border-border hover:bg-muted/20",
                        aberto?.chave === g.chave && "bg-muted/30",
                      )}
                    >
                      <td className="px-4 py-3 font-medium text-foreground">{g.nome}</td>
                      <td className="px-4 py-3 text-right text-foreground">{g.abertos}</td>
                      <td
                        className={cn(
                          "px-4 py-3 text-right",
                          g.parados48h > 0
                            ? "font-medium text-amber-700 dark:text-amber-300"
                            : "text-muted-foreground",
                        )}
                      >
                        {g.parados48h}
                      </td>
                      {incluirFechados ? (
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {g.fechadosNoMes}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {aberto ? (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-foreground">
                {aberto.nome}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {lista.length} chamado{lista.length === 1 ? "" : "s"}
                </span>
              </h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAberto(null);
                  setLista([]);
                }}
                aria-label="Fechar lista"
              >
                <X className="size-4" />
              </Button>
            </div>
            {carregandoLista ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[880px] text-left font-sans text-sm">
                  <thead className="bg-muted/30 text-muted-foreground">
                    <tr>
                      {[
                        "Nº",
                        "Título",
                        "Cliente",
                        "Responsável",
                        "Estágio",
                        "Aberto em",
                        "Última atividade",
                      ].map((c) => (
                        <th key={c} className="px-4 py-3 text-xs font-semibold uppercase">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((l) => (
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
                        <td className="px-4 py-3 text-muted-foreground">{l.responsavel}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {l.estagio ?? "—"}
                          {l.fechado ? " (fechado)" : ""}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatDateTime(l.abertoEm)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatDateTime(l.ultimaAtividade)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
