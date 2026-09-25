"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadErrorState } from "@/components/ui/load-error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { dataBr, formatarMinutos } from "@/lib/horas";
import { cargaService, type Carga } from "@/lib/services/carga.service";
import { cn } from "@/lib/utils";

function corPercentual(p: number | null) {
  if (p == null) return "text-muted-foreground";
  if (p < 70) return "text-amber-600 dark:text-amber-400";
  if (p > 120) return "text-rose-600 dark:text-rose-400";
  return "text-emerald-600 dark:text-emerald-400";
}

/** Barra de horas: o traço marca o esperado até hoje. */
function BarraHoras({ feito, esperado }: { feito: number; esperado: number }) {
  const max = Math.max(feito, esperado, 1) * 1.1;
  return (
    <div
      className="relative h-2 w-full min-w-24 rounded-full bg-muted"
      role="img"
      aria-label={`${formatarMinutos(feito)} de ${formatarMinutos(esperado)} esperadas até hoje`}
    >
      <span
        className="absolute inset-y-0 left-0 rounded-full bg-primary"
        style={{ width: `${(feito / max) * 100}%` }}
      />
      <span
        className="absolute inset-y-[-3px] w-0.5 bg-foreground/60"
        style={{ left: `${(esperado / max) * 100}%` }}
      />
    </div>
  );
}

/**
 * Carga da equipe: chamados abertos e parados (48 h sem movimento) por
 * técnico e por mesa, e as horas da semana contra a jornada.
 */
export function CargaEquipe() {
  const [dados, setDados] = useState<Carga | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [aberto, setAberto] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    cargaService
      .carga()
      .then((r) => {
        if (cancelado) return;
        setErro(null);
        setDados(r);
      })
      .catch((err) => {
        if (!cancelado)
          setErro(err instanceof Error ? err.message : "Falha ao carregar.");
      });
    return () => {
      cancelado = true;
    };
  }, [tentativa]);

  if (erro)
    return (
      <LoadErrorState
        message={erro}
        onRetry={() => setTentativa((t) => t + 1)}
      />
    );
  if (!dados) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Semana de {dataBr(dados.semana.inicio)} a {dataBr(dados.semana.fim)} ·{" "}
        {dados.semana.diasUteisAteHoje} dia
        {dados.semana.diasUteisAteHoje > 1 ? "s" : ""} úte
        {dados.semana.diasUteisAteHoje > 1 ? "is" : "il"} até hoje. Parado = sem
        movimento há mais de 48 h.
      </p>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[
          ["Chamados abertos", dados.totais.abertos, false],
          ["Parados", dados.totais.parados, dados.totais.parados > 0],
          [
            "Sem responsável",
            dados.totais.semResponsavel,
            dados.totais.semResponsavel > 0,
          ],
        ].map(([rotulo, n, alerta]) => (
          <Card key={String(rotulo)}>
            <CardContent className="space-y-1 p-3 sm:p-6">
              <p className="text-[11px] uppercase leading-tight text-muted-foreground sm:text-xs">
                {rotulo}
              </p>
              <p
                className={cn(
                  "text-2xl font-semibold tabular-nums sm:text-3xl",
                  alerta ? "text-amber-600 dark:text-amber-400" : "",
                )}
              >
                {n as number}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Por mesa</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th scope="col" className="pb-2 font-medium">
                  Mesa
                </th>
                <th scope="col" className="pb-2 text-right font-medium">
                  Pessoas
                </th>
                <th scope="col" className="pb-2 text-right font-medium">
                  Abertos
                </th>
                <th scope="col" className="pb-2 text-right font-medium">
                  Parados
                </th>
                <th scope="col" className="pb-2 text-right font-medium">
                  Sem responsável
                </th>
                <th scope="col" className="pb-2 text-right font-medium">
                  Horas / esperado
                </th>
              </tr>
            </thead>
            <tbody>
              {dados.mesas.map((m) => (
                <tr key={m.mesa} className="border-t border-border">
                  <td className="py-2">{m.mesa}</td>
                  <td className="py-2 text-right tabular-nums">{m.pessoas}</td>
                  <td className="py-2 text-right tabular-nums">{m.abertos}</td>
                  <td
                    className={cn(
                      "py-2 text-right tabular-nums",
                      m.parados
                        ? "font-semibold text-amber-600 dark:text-amber-400"
                        : "",
                    )}
                  >
                    {m.parados}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {m.semResponsavel}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {formatarMinutos(m.minutosSemana)} /{" "}
                    {formatarMinutos(m.esperadoAteHoje)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Por técnico</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {dados.pessoas.map((p) => {
              const expandido = aberto === p.userId;
              return (
                <li key={p.userId} className="py-3">
                  <div className="grid grid-cols-2 items-center gap-x-4 gap-y-2 text-sm sm:grid-cols-[minmax(10rem,1.5fr)_repeat(2,5rem)_minmax(8rem,2fr)_5rem]">
                    <div className="col-span-2 sm:col-span-1">
                      <p className="font-medium">{p.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.mesa}
                        {p.papel === "PJ" ? " · Terceiro" : ""}
                      </p>
                    </div>
                    <p className="tabular-nums">
                      <span className="text-xs text-muted-foreground sm:hidden">
                        Abertos{" "}
                      </span>
                      {p.abertos}
                    </p>
                    {p.parados ? (
                      <button
                        type="button"
                        aria-expanded={expandido}
                        onClick={() => setAberto(expandido ? null : p.userId)}
                        className="inline-flex items-center gap-1 font-semibold tabular-nums text-amber-600 dark:text-amber-400"
                      >
                        <span className="text-xs font-normal text-muted-foreground sm:hidden">
                          Parados{" "}
                        </span>
                        {p.parados}
                        <ChevronDown
                          className={cn(
                            "size-4 transition-transform",
                            expandido && "rotate-180",
                          )}
                          aria-hidden
                        />
                        <span className="sr-only">ver chamados parados</span>
                      </button>
                    ) : (
                      <p className="tabular-nums text-muted-foreground">
                        <span className="text-xs sm:hidden">Parados </span>0
                      </p>
                    )}
                    <div className="col-span-2 space-y-1 sm:col-span-1">
                      <BarraHoras
                        feito={p.minutosSemana}
                        esperado={p.esperadoAteHoje}
                      />
                      <p className="text-xs text-muted-foreground">
                        {formatarMinutos(p.minutosSemana)} de{" "}
                        {formatarMinutos(p.esperadoAteHoje)} até hoje · jornada{" "}
                        {formatarMinutos(p.jornadaSemana)}/semana
                      </p>
                    </div>
                    <p
                      className={cn(
                        "text-right font-semibold tabular-nums",
                        corPercentual(p.percentual),
                      )}
                    >
                      {p.percentual == null ? "—" : `${p.percentual}%`}
                    </p>
                  </div>
                  {expandido ? (
                    <ul className="mt-2 space-y-1 rounded-lg bg-muted/40 p-3 text-sm">
                      {p.chamadosParados.map((c) => (
                        <li key={c.ticketNumber}>
                          <Link
                            href={`/tickets/${c.ticketNumber}`}
                            className="text-primary hover:underline"
                          >
                            #{c.ticketNumber}
                          </Link>{" "}
                          {c.titulo ?? ""}{" "}
                          <span className="text-muted-foreground">
                            · parado há {c.dias} dia{c.dias === 1 ? "" : "s"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
