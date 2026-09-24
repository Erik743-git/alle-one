"use client";

import { useEffect, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadErrorState } from "@/components/ui/load-error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { npsService, type PainelNps } from "@/lib/services/nps.service";
import { cn } from "@/lib/utils";

function corNps(nps: number | null) {
  if (nps == null) return "text-muted-foreground";
  if (nps >= 50) return "text-emerald-600 dark:text-emerald-400";
  if (nps >= 0) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

function corNota(nota: number) {
  if (nota <= 6) return "bg-rose-500/15 text-rose-700 dark:text-rose-300";
  if (nota <= 8) return "bg-amber-400/20 text-amber-800 dark:text-amber-300";
  return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
}

/** Faixa promotores/neutros/detratores, proporcional. */
function Barra({ p, n, d }: { p: number; n: number; d: number }) {
  const total = p + n + d || 1;
  return (
    <div
      className="flex h-2 w-full overflow-hidden rounded-full bg-muted"
      role="img"
      aria-label={`${p} promotores, ${n} neutros, ${d} detratores`}
    >
      <span
        className="bg-emerald-500"
        style={{ width: `${(p / total) * 100}%` }}
      />
      <span
        className="bg-amber-400"
        style={{ width: `${(n / total) * 100}%` }}
      />
      <span
        className="bg-rose-500"
        style={{ width: `${(d / total) * 100}%` }}
      />
    </div>
  );
}

/**
 * Aba NPS de Administração → Satisfação: a pergunta relacional (0 a 10),
 * separada das estrelas de cada chamado. NPS = % promotores (9–10) − %
 * detratores (0–6).
 */
export function PainelNpsAba({
  de,
  ate,
  versao,
}: {
  de: string;
  ate: string;
  versao: number;
}) {
  const [dados, setDados] = useState<PainelNps | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let cancelado = false;
    npsService
      .painel(de, ate)
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
  }, [de, ate, versao, tentativa]);

  if (erro)
    return (
      <LoadErrorState
        message={erro}
        onRetry={() => setTentativa((t) => t + 1)}
      />
    );
  if (!dados) return <Skeleton className="h-40 w-full" />;

  const g = dados.global;
  const taxa = dados.enviadas
    ? Math.round((g.respostas / dados.enviadas) * 100)
    : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="space-y-1 pt-6">
            <p className="text-xs uppercase text-muted-foreground">
              NPS no período
            </p>
            <p
              className={cn(
                "text-3xl font-semibold tabular-nums",
                corNps(g.nps),
              )}
            >
              {g.nps ?? "—"}
            </p>
            <p className="text-xs text-muted-foreground">de −100 a +100</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 pt-6">
            <p className="text-xs uppercase text-muted-foreground">
              Responderam
            </p>
            <p className="text-3xl font-semibold tabular-nums">{g.respostas}</p>
            <p className="text-xs text-muted-foreground">
              de {dados.enviadas} enviadas{taxa != null ? ` (${taxa}%)` : ""}
            </p>
          </CardContent>
        </Card>
        <Card className="sm:col-span-2">
          <CardContent className="space-y-2 pt-6">
            <p className="text-xs uppercase text-muted-foreground">
              Composição
            </p>
            <Barra p={g.promotores} n={g.neutros} d={g.detratores} />
            <p className="text-sm">
              <span className="text-emerald-700 dark:text-emerald-300">
                {g.promotores} promotores (9–10)
              </span>{" "}
              ·{" "}
              <span className="text-amber-700 dark:text-amber-300">
                {g.neutros} neutros (7–8)
              </span>{" "}
              ·{" "}
              <span className="text-rose-700 dark:text-rose-300">
                {g.detratores} detratores (0–6)
              </span>
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Por trimestre</CardTitle>
          </CardHeader>
          <CardContent>
            {dados.porTrimestre.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma resposta no período.
              </p>
            ) : (
              <ul className="space-y-3">
                {dados.porTrimestre.map((t) => (
                  <li key={t.trimestre} className="space-y-1">
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="font-medium">
                        {t.trimestre.replace("-T", " · T")}
                      </span>
                      <span className="tabular-nums">
                        <strong className={corNps(t.nps)}>{t.nps}</strong>{" "}
                        <span className="text-muted-foreground">
                          ({t.respostas} resp.)
                        </span>
                      </span>
                    </div>
                    <Barra p={t.promotores} n={t.neutros} d={t.detratores} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Por empresa</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {dados.porEmpresa.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma resposta no período.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th scope="col" className="pb-2 font-medium">
                      Empresa
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      NPS
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Respostas
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {dados.porEmpresa.map((e) => (
                    <tr key={e.companyId} className="border-t border-border">
                      <td className="py-2">{e.nome}</td>
                      <td
                        className={cn(
                          "py-2 text-right font-semibold tabular-nums",
                          corNps(e.nps),
                        )}
                      >
                        {e.nps}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {e.respostas}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Comentários</CardTitle>
          <p className="text-sm text-muted-foreground">Detratores primeiro.</p>
        </CardHeader>
        <CardContent>
          {dados.comentarios.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ninguém comentou no período.
            </p>
          ) : (
            <ul className="space-y-3">
              {dados.comentarios.map((c, i) => (
                <li
                  key={`${c.respondidaEm}-${i}`}
                  className={cn(
                    "rounded-lg border p-3",
                    c.classe === "DETRATOR"
                      ? "border-rose-500/40 bg-rose-500/5"
                      : "border-border",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span
                      className={cn(
                        "rounded-md px-2 py-0.5 font-semibold tabular-nums",
                        corNota(c.nota),
                      )}
                    >
                      {c.nota}
                    </span>
                    <span className="font-medium">{c.nome}</span>
                    <span className="text-muted-foreground">· {c.empresa}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {new Date(c.respondidaEm).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                  {/* Texto do cliente: React escapa, nada vira HTML. */}
                  <p className="mt-1 whitespace-pre-line break-words text-sm">
                    {c.comentario}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
