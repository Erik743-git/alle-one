"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, RefreshCw, Star } from "lucide-react";

import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import AppShell from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Skeleton } from "@/components/ui/skeleton";
import { notifyError } from "@/lib/notify";
import { apiRequest } from "@/lib/api";

type Grupo = { nome: string; media: number; nps: number; respostas: number };

type Resumo = {
  periodo: { de: string; ate: string };
  enviadas: number;
  respondidas: number;
  taxaResposta: number;
  media: number | null;
  nps: number | null;
  distribuicao: Array<{ estrelas: number; total: number }>;
  porMes: Array<{ mes: string; media: number; nps: number; respostas: number }>;
  porMesa: Grupo[];
  porEmpresa: Grupo[];
  ranking: Array<Grupo & { promotores: number; detratores: number }>;
  semVolumeSuficiente: Array<{ nome: string; respostas: number }>;
};

type Resposta = {
  ticketNumber: number;
  rating: number | null;
  comment: string | null;
  answeredAt: string | null;
  requestorName: string | null;
  responsibleName: string | null;
  companyName: string | null;
  channel: string | null;
};

function formatarData(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function mesLegivel(mes: string) {
  const [ano, m] = mes.split("-");
  const data = new Date(Number(ano), Number(m) - 1, 1);
  return data.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}

/** Barra simples; o portal não tem biblioteca de gráfico para este caso. */
function Barra({ valor, max }: { valor: number; max: number }) {
  const largura = max > 0 ? Math.round((valor / max) * 100) : 0;
  return (
    <div className="h-2 w-full rounded-full bg-muted">
      <div
        className="h-2 rounded-full bg-primary"
        style={{ width: `${largura}%` }}
      />
    </div>
  );
}

function Estrelas({ nota }: { nota: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((v) => (
        <Star
          key={v}
          className={
            v <= nota
              ? "size-3.5 fill-amber-400 text-amber-400"
              : "size-3.5 text-muted-foreground/30"
          }
        />
      ))}
    </span>
  );
}

function TabelaGrupo({ titulo, linhas }: { titulo: string; linhas: Grupo[] }) {
  const max = Math.max(1, ...linhas.map((l) => l.respostas));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{titulo}</CardTitle>
      </CardHeader>
      <CardContent>
        {linhas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem respostas ainda.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="pb-2 text-left font-medium">Nome</th>
                <th className="pb-2 text-right font-medium">Média</th>
                <th className="pb-2 text-right font-medium">NPS</th>
                <th className="pb-2 text-right font-medium">Respostas</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((linha) => (
                <tr key={linha.nome} className="border-t border-border/40">
                  <td className="py-2">
                    <div>{linha.nome}</div>
                    <Barra valor={linha.respostas} max={max} />
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {linha.media.toFixed(2)}
                  </td>
                  <td className="py-2 text-right tabular-nums">{linha.nps}</td>
                  <td className="py-2 text-right tabular-nums">
                    {linha.respostas}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function AdminSatisfacaoPageImpl() {
  const hoje = new Date().toISOString().slice(0, 10);
  const seisMesesAtras = new Date();
  seisMesesAtras.setMonth(seisMesesAtras.getMonth() - 5);

  const [de, setDe] = useState(seisMesesAtras.toISOString().slice(0, 10));
  const [ate, setAte] = useState(hoje);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [respostas, setRespostas] = useState<Resposta[]>([]);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const query = `?de=${de}&ate=${ate}`;
      const [r, lista] = await Promise.all([
        apiRequest<Resumo>(`/satisfacao/painel/resumo${query}`),
        apiRequest<Resposta[]>(`/satisfacao/painel/respostas${query}`),
      ]);
      setResumo(r);
      setRespostas(lista);
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível carregar.",
      );
    } finally {
      setCarregando(false);
    }
  }, [de, ate]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const maxMes = Math.max(1, ...(resumo?.porMes ?? []).map((m) => m.respostas));
  const maxDistribuicao = Math.max(
    1,
    ...(resumo?.distribuicao ?? []).map((d) => d.total),
  );

  return (
    <ProtectedPage>
      <PermissionGate module="ADMIN">
        <AppShell>
          <div className="mx-auto w-full max-w-6xl space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Link
                  href="/admin"
                  className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="size-4" />
                  Administração
                </Link>
                <h1 className="text-2xl font-semibold">Satisfação</h1>
                <p className="text-sm text-muted-foreground">
                  Pesquisa enviada no fechamento de cada chamado. O NPS vem das
                  estrelas: 5 é promotor, 4 é neutro, 1 a 3 é detrator.
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">De</span>
                  <DatePickerField value={de} onChange={setDe} />
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Até</span>
                  <DatePickerField value={ate} onChange={setAte} align="end" />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void carregar()}
                  disabled={carregando}
                >
                  {carregando ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 size-4" />
                  )}
                  Atualizar
                </Button>
              </div>
            </div>

            {carregando && !resumo ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Card>
                    <CardContent className="space-y-1 pt-6">
                      <p className="text-xs uppercase text-muted-foreground">
                        NPS
                      </p>
                      <p className="text-3xl font-semibold tabular-nums">
                        {resumo?.nps ?? "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        de -100 a 100
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="space-y-1 pt-6">
                      <p className="text-xs uppercase text-muted-foreground">
                        Média
                      </p>
                      <p className="text-3xl font-semibold tabular-nums">
                        {resumo?.media?.toFixed(2) ?? "—"}
                      </p>
                      <Estrelas nota={Math.round(resumo?.media ?? 0)} />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="space-y-1 pt-6">
                      <p className="text-xs uppercase text-muted-foreground">
                        Respostas
                      </p>
                      <p className="text-3xl font-semibold tabular-nums">
                        {resumo?.respondidas ?? 0}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        de {resumo?.enviadas ?? 0} enviadas
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="space-y-1 pt-6">
                      <p className="text-xs uppercase text-muted-foreground">
                        Taxa de resposta
                      </p>
                      <p className="text-3xl font-semibold tabular-nums">
                        {resumo?.taxaResposta ?? 0}%
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">
                        Distribuição das notas
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {(resumo?.distribuicao ?? [])
                        .slice()
                        .reverse()
                        .map((item) => (
                          <div
                            key={item.estrelas}
                            className="flex items-center gap-3"
                          >
                            <span className="w-16 shrink-0">
                              <Estrelas nota={item.estrelas} />
                            </span>
                            <Barra
                              valor={item.total}
                              max={maxDistribuicao}
                            />
                            <span className="w-8 shrink-0 text-right text-sm tabular-nums">
                              {item.total}
                            </span>
                          </div>
                        ))}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Por mês</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {(resumo?.porMes ?? []).length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Sem respostas ainda.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {(resumo?.porMes ?? []).map((mes) => (
                            <div
                              key={mes.mes}
                              className="flex items-center gap-3"
                            >
                              <span className="w-16 shrink-0 text-sm">
                                {mesLegivel(mes.mes)}
                              </span>
                              <Barra valor={mes.respostas} max={maxMes} />
                              <span className="w-24 shrink-0 text-right text-sm tabular-nums">
                                {mes.media.toFixed(2)} · NPS {mes.nps}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Ranking por atendente
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Conta para quem estava com o chamado no fechamento. Entra
                      quem tem cinco respostas ou mais no período.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {(resumo?.ranking ?? []).length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Ninguém atingiu cinco respostas neste período.
                      </p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="text-xs uppercase text-muted-foreground">
                          <tr>
                            <th className="pb-2 text-left font-medium">#</th>
                            <th className="pb-2 text-left font-medium">
                              Atendente
                            </th>
                            <th className="pb-2 text-right font-medium">
                              Média
                            </th>
                            <th className="pb-2 text-right font-medium">NPS</th>
                            <th className="pb-2 text-right font-medium">
                              Promot.
                            </th>
                            <th className="pb-2 text-right font-medium">
                              Detrat.
                            </th>
                            <th className="pb-2 text-right font-medium">
                              Respostas
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {(resumo?.ranking ?? []).map((linha, indice) => (
                            <tr
                              key={linha.nome}
                              className="border-t border-border/40"
                            >
                              <td className="py-2 tabular-nums">
                                {indice + 1}
                              </td>
                              <td className="py-2">{linha.nome}</td>
                              <td className="py-2 text-right tabular-nums">
                                {linha.media.toFixed(2)}
                              </td>
                              <td className="py-2 text-right tabular-nums">
                                {linha.nps}
                              </td>
                              <td className="py-2 text-right tabular-nums">
                                {linha.promotores}
                              </td>
                              <td className="py-2 text-right tabular-nums">
                                {linha.detratores}
                              </td>
                              <td className="py-2 text-right tabular-nums">
                                {linha.respostas}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {(resumo?.semVolumeSuficiente ?? []).length > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Ainda sem respostas suficientes:{" "}
                        {(resumo?.semVolumeSuficiente ?? [])
                          .map((p) => `${p.nome} (${p.respostas})`)
                          .join(", ")}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>

                <div className="grid gap-4 lg:grid-cols-2">
                  <TabelaGrupo
                    titulo="Por mesa"
                    linhas={resumo?.porMesa ?? []}
                  />
                  <TabelaGrupo
                    titulo="Por empresa"
                    linhas={resumo?.porEmpresa ?? []}
                  />
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Respostas</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {respostas.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Nenhuma resposta no período.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {respostas.map((item) => (
                          <div
                            key={item.ticketNumber}
                            className="rounded-lg border border-border/50 p-3"
                          >
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                              <Estrelas nota={item.rating ?? 0} />
                              <Link
                                href={`/tickets/${item.ticketNumber}`}
                                className="font-medium hover:underline"
                              >
                                #{item.ticketNumber}
                              </Link>
                              <span className="text-muted-foreground">
                                {item.companyName ?? "—"} ·{" "}
                                {item.responsibleName ?? "—"} ·{" "}
                                {formatarData(item.answeredAt)}
                              </span>
                            </div>
                            {item.comment ? (
                              <p className="mt-1 text-sm">{item.comment}</p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </AppShell>
      </PermissionGate>
    </ProtectedPage>
  );
}

export { AdminSatisfacaoPageImpl as PortalPageComponent };
