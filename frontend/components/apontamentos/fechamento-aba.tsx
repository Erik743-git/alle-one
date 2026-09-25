"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Lock, LockOpen, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoadErrorState } from "@/components/ui/load-error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/lib/confirm";
import { dataBr } from "@/lib/horas";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  fechamentoService,
  type CicloResumo,
  type Conferencia,
  type TipoAchado,
} from "@/lib/services/fechamento.service";
import { cn } from "@/lib/utils";

const ROTULO: Record<TipoAchado, { titulo: string; ajuda: string }> = {
  SOBREPOSICAO: {
    titulo: "Sobreposição",
    ajuda: "A mesma pessoa com dois apontamentos no mesmo horário.",
  },
  DIA_LONGO: {
    titulo: "Dia com mais de 12 h",
    ajuda: "Soma do dia acima de 12 horas.",
  },
  FIM_DE_SEMANA: {
    titulo: "Fim de semana sem plantão",
    ajuda: "Hora no sábado ou domingo que não foi lançada como plantão.",
  },
  LANCADO_DEPOIS: {
    titulo: "Lançado depois do dia",
    ajuda: "Apontamento registrado em dia posterior ao trabalhado.",
  },
};

const TIPOS = Object.keys(ROTULO) as TipoAchado[];

/**
 * Apontamentos → Fechamento (só admin). Mostra o ciclo 26 → 25 com o que
 * pede conferência; "Fechar ciclo" trava as horas do período para todos, e
 * reabrir exige motivo (vai para o histórico e para a Auditoria).
 */
export function FechamentoAba() {
  const confirm = useConfirm();
  const [ciclos, setCiclos] = useState<CicloResumo[] | null>(null);
  const [ciclo, setCiclo] = useState<string | null>(null);
  const [dados, setDados] = useState<Conferencia | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<TipoAchado | null>(null);
  const [acao, setAcao] = useState(false);
  const [reabrindo, setReabrindo] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let cancelado = false;
    fechamentoService
      .listar()
      .then((lista) => {
        if (cancelado) return;
        setCiclos(lista);
        // Abre no último ciclo já terminado (o que está para fechar).
        setCiclo(
          (atual) =>
            atual ??
            lista.find((c) => c.encerrado)?.ciclo ??
            lista[0]?.ciclo ??
            null,
        );
      })
      .catch((err) => {
        if (!cancelado)
          setErro(err instanceof Error ? err.message : "Falha ao carregar.");
      });
    return () => {
      cancelado = true;
    };
  }, [versao]);

  useEffect(() => {
    if (!ciclo) return;
    let cancelado = false;
    fechamentoService
      .conferencia(ciclo)
      .then((c) => {
        if (!cancelado) setDados(c);
      })
      .catch((err) => {
        if (!cancelado)
          setErro(err instanceof Error ? err.message : "Falha ao carregar.");
      });
    return () => {
      cancelado = true;
    };
  }, [ciclo, versao]);

  if (erro) {
    return (
      <LoadErrorState
        message={erro}
        onRetry={() => {
          setErro(null);
          setVersao((v) => v + 1);
        }}
      />
    );
  }
  if (!ciclos) return <Skeleton className="h-40 w-full" />;

  const atual = ciclos.find((c) => c.ciclo === ciclo) ?? null;
  const achados = (dados?.ciclo === ciclo ? dados.achados : []).filter(
    (a) => !filtro || a.tipo === filtro,
  );

  async function fechar() {
    if (!atual || !dados) return;
    const total = dados.achados.length;
    const ok = await confirm({
      title: `Fechar o ciclo de ${dataBr(atual.inicio)} a ${dataBr(atual.fim)}?`,
      description:
        (total
          ? `Ainda há ${total} ponto${total > 1 ? "s" : ""} para conferir. `
          : "Nenhum ponto de conferência. ") +
        "Depois de fechado, ninguém cria, edita ou apaga apontamento nesse período até um admin reabrir.",
      confirmText: "Fechar ciclo",
      variant: total ? "warning" : undefined,
    });
    if (!ok) return;
    setAcao(true);
    try {
      setDados(await fechamentoService.fechar(atual.ciclo));
      notifySuccess("Ciclo fechado. As horas do período estão travadas.");
      setVersao((v) => v + 1);
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível fechar.",
      );
    } finally {
      setAcao(false);
    }
  }

  async function reabrir() {
    if (!atual) return;
    setAcao(true);
    try {
      setDados(await fechamentoService.reabrir(atual.ciclo, motivo));
      notifySuccess("Ciclo reaberto. O motivo ficou no histórico.");
      setReabrindo(false);
      setMotivo("");
      setVersao((v) => v + 1);
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível reabrir.",
      );
    } finally {
      setAcao(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span className="block text-xs text-muted-foreground">Ciclo</span>
          <select
            value={ciclo ?? ""}
            onChange={(e) => {
              setCiclo(e.target.value);
              setFiltro(null);
            }}
            className="h-11 rounded-md border border-border bg-background px-3 text-sm"
          >
            {ciclos.map((c) => (
              <option key={c.ciclo} value={c.ciclo}>
                {dataBr(c.inicio)} a {dataBr(c.fim)}
                {c.fechado
                  ? " · fechado"
                  : c.encerrado
                    ? ""
                    : " · em andamento"}
              </option>
            ))}
          </select>
        </label>
        {atual ? (
          atual.fechado ? (
            <Button
              type="button"
              variant="outline"
              disabled={acao}
              onClick={() => setReabrindo(true)}
            >
              <LockOpen className="mr-2 size-4" />
              Reabrir ciclo
            </Button>
          ) : (
            <Button
              type="button"
              disabled={
                acao || !atual.encerrado || dados?.ciclo !== atual.ciclo
              }
              onClick={() => void fechar()}
              title={
                atual.encerrado
                  ? undefined
                  : "O ciclo só pode ser fechado depois do dia 25."
              }
            >
              {acao ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Lock className="mr-2 size-4" />
              )}
              Fechar ciclo
            </Button>
          )
        ) : null}
        {atual ? (
          <span
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-full px-3 text-xs font-medium",
              atual.fechado
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : atual.encerrado
                  ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {atual.fechado
              ? "Fechado: horas travadas"
              : atual.encerrado
                ? "Aguardando fechamento"
                : "Em andamento"}
          </span>
        ) : null}
      </div>

      {!dados || dados.ciclo !== ciclo ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {dados.apontamentos} apontamento
            {dados.apontamentos === 1 ? "" : "s"} de {dados.pessoas} pessoa
            {dados.pessoas === 1 ? "" : "s"} no período (lançados pelo portal).
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TIPOS.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={filtro === t}
                onClick={() => setFiltro((f) => (f === t ? null : t))}
                className={cn(
                  "rounded-xl border p-4 text-left transition-colors hover:bg-muted/40",
                  filtro === t
                    ? "border-primary bg-primary/5"
                    : "border-border",
                )}
              >
                <p className="text-xs uppercase text-muted-foreground">
                  {ROTULO[t].titulo}
                </p>
                <p
                  className={cn(
                    "text-2xl font-semibold tabular-nums",
                    dados.resumo[t]
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-muted-foreground",
                  )}
                >
                  {dados.resumo[t]}
                </p>
                <p className="text-xs text-muted-foreground">
                  {ROTULO[t].ajuda}
                </p>
              </button>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Para conferir{filtro ? ` · ${ROTULO[filtro].titulo}` : ""}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {achados.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nada para conferir.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {achados.slice(0, 300).map((a, i) => (
                    <li
                      key={`${a.tipo}-${a.apontamentos.join("-")}-${i}`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm"
                    >
                      <span className="w-24 shrink-0 tabular-nums text-muted-foreground">
                        {dataBr(a.data)}
                      </span>
                      <span className="min-w-32 font-medium">{a.nome}</span>
                      <span className="flex-1 text-muted-foreground">
                        {a.detalhe}
                      </span>
                      <span className="flex gap-2">
                        {a.chamados.map((n) => (
                          <Link
                            key={n}
                            href={`/tickets/${n}`}
                            className="text-primary underline-offset-2 hover:underline"
                          >
                            #{n}
                          </Link>
                        ))}
                        <Link
                          href={`/apontamentos/${a.userId}`}
                          className="text-primary underline-offset-2 hover:underline"
                        >
                          agenda
                        </Link>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {achados.length > 300 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Mostrando os 300 primeiros.
                </p>
              ) : null}
            </CardContent>
          </Card>

          {dados.historico.length ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Histórico do ciclo</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {dados.historico.map((h, i) => (
                    <li key={`${h.em}-${i}`}>
                      <strong>
                        {h.acao === "FECHOU" ? "Fechado" : "Reaberto"}
                      </strong>{" "}
                      por {h.por} em {new Date(h.em).toLocaleString("pt-BR")}
                      {h.acao === "FECHOU" && h.pendencias != null
                        ? ` (${h.pendencias} ponto${h.pendencias === 1 ? "" : "s"} de conferência)`
                        : ""}
                      {h.motivo ? (
                        <span className="block text-muted-foreground">
                          Motivo: {h.motivo}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}

      <Dialog open={reabrindo} onOpenChange={(v) => !acao && setReabrindo(v)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reabrir o ciclo</DialogTitle>
            <DialogDescription>
              As horas do período voltam a aceitar alteração. O motivo fica no
              histórico e na Auditoria.
            </DialogDescription>
          </DialogHeader>
          <label htmlFor="motivo-reabrir" className="text-sm">
            Motivo (mínimo de 10 caracteres)
          </label>
          <Textarea
            id="motivo-reabrir"
            rows={3}
            maxLength={2000}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setReabrindo(false)}
              disabled={acao}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void reabrir()}
              disabled={acao || motivo.trim().length < 10}
            >
              {acao ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Reabrir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
