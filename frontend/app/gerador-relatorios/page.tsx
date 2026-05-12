"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Loader2, RefreshCw } from "lucide-react";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import { Input } from "@/components/ui/input";
import { getStoredUser } from "@/lib/session";
import { reportsService } from "@/lib/services/reports.service";
import type { ReportRow } from "@/lib/services/reports.service";
import { downloadDebugDump } from "@/lib/services/dashboard.service";

export default function GeradorRelatoriosPage() {
  const user = useMemo(() => getStoredUser(), []);
  const [carregando, setCarregando] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [baixandoDump, setBaixandoDump] = useState(false);
  const [erro, setErro] = useState("");

  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>(
    []
  );
  const [companyId, setCompanyId] = useState<string>("");
  const [type, setType] = useState<string>("1");
  const [format, setFormat] = useState<"CSV" | "PDF" | "XLSX">("CSV");
  const [start, setStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().slice(0, 10);
  });
  const [end, setEnd] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const [lastReport, setLastReport] = useState<ReportRow | null>(null);
  const [reports, setReports] = useState<ReportRow[]>([]);

  const types = useMemo(
    () => [
      { value: "1", label: "Tipo 1" },
      { value: "2", label: "Tipo 2" },
      { value: "3", label: "Tipo 3" },
      { value: "4", label: "Tipo 4" },
    ],
    []
  );

  async function loadAll() {
    setErro("");
    setCarregando(true);
    try {
      const comps = await reportsService.listCompanies();
      setCompanies(comps);

      const defaultCompanyId =
        companyId ||
        (user?.role === "CLIENT" && user.companyId ? user.companyId : "") ||
        comps[0]?.id ||
        "";

      setCompanyId(defaultCompanyId);

      const [items, last] = await Promise.all([
        reportsService.list({
          companyId: defaultCompanyId || undefined,
          type: type || undefined,
        }),
        reportsService.last({
          companyId: defaultCompanyId || undefined,
          type: type || undefined,
        }),
      ]);

      setReports(items ?? []);
      setLastReport(last ?? null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar relatórios.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshList() {
    setErro("");
    try {
      const [items, last] = await Promise.all([
        reportsService.list({ companyId: companyId || undefined, type }),
        reportsService.last({ companyId: companyId || undefined, type }),
      ]);
      setReports(items ?? []);
      setLastReport(last ?? null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao atualizar.");
    }
  }

  async function handleGenerate() {
    setErro("");

    if (!companyId) {
      setErro("Selecione a empresa.");
      return;
    }
    if (!start || !end) {
      setErro("Selecione data inicial e final.");
      return;
    }

    // valida datas (input type="date" pode virar string vazia quando a data é inválida)
    const startDate = new Date(`${start}T00:00:00`);
    const endDate = new Date(`${end}T23:59:59`);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      setErro("Data inválida. Verifique a data inicial e a data final.");
      return;
    }
    if (endDate.getTime() < startDate.getTime()) {
      setErro("Período inválido (data final menor que a data inicial).");
      return;
    }

    try {
      setGerando(true);
      await reportsService.generate({
        companyId,
        type,
        format,
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      });
      await refreshList();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao gerar relatório.");
    } finally {
      setGerando(false);
    }
  }

  async function handleDownload(reportId: string) {
    setErro("");
    try {
      const { blob, filename } = await reportsService.download(reportId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao baixar relatório.");
    }
  }

  async function handleDownloadDebugDump() {
    setErro("");

    if (user?.role !== "ADMIN") {
      setErro("Apenas administradores podem baixar o dump.");
      return;
    }

    if (!companyId) {
      setErro("Selecione a empresa.");
      return;
    }
    if (!start || !end) {
      setErro("Selecione data inicial e final.");
      return;
    }

    const startDate = new Date(`${start}T00:00:00`);
    const endDate = new Date(`${end}T23:59:59`);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      setErro("Data inválida. Verifique a data inicial e a data final.");
      return;
    }
    if (endDate.getTime() < startDate.getTime()) {
      setErro("Período inválido (data final menor que a data inicial).");
      return;
    }

    try {
      setBaixandoDump(true);
      const { blob, filename } = await downloadDebugDump({
        companyId,
        start,
        end,
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao baixar dump.");
    } finally {
      setBaixandoDump(false);
    }
  }

  return (
    <ProtectedPage>
    <PermissionGate module="REPORTS">
    <AppShell>
      <div className="font-sans relative w-full overflow-hidden rounded-[28px] bg-background">
        <div className="relative z-10 space-y-6 p-4 sm:p-6 xl:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold text-foreground">Relatórios</h1>
              <p className="text-muted-foreground">
                Gere e baixe relatórios por período, empresa e tipo.
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() => void loadAll()}
              disabled={carregando}
              className="h-11"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Atualizar
            </Button>
          </div>

          {erro ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {erro}
            </div>
          ) : null}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm text-muted-foreground">
                Filtros e geração
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Data inicial
                  </label>
                  <Input
                    type="date"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                    className="h-11 rounded-xl"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Data final
                  </label>
                  <Input
                    type="date"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                    className="h-11 rounded-xl"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Empresa
                  </label>
                  <select
                    value={companyId}
                    onChange={(e) => setCompanyId(e.target.value)}
                    disabled={carregando || companies.length === 0}
                    className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm text-foreground outline-none disabled:opacity-60"
                  >
                    <option value="">
                      {carregando ? "Carregando..." : "Selecione"}
                    </option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Tipo
                  </label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm text-foreground outline-none"
                  >
                    {types.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Formato
                  </label>
                  <select
                    value={format}
                    onChange={(e) =>
                      setFormat(e.target.value as "CSV" | "PDF" | "XLSX")
                    }
                    className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm text-foreground outline-none"
                  >
                    <option value="CSV">CSV</option>
                    <option value="XLSX">XLSX</option>
                    <option value="PDF">PDF (em breve)</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  Permissões: CLIENT vê apenas sua empresa. ADMIN vê todas.
                  COLLABORATOR pode escolher qualquer empresa.
                </p>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  {user?.role === "ADMIN" ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleDownloadDebugDump()}
                      disabled={carregando || gerando || baixandoDump}
                      className="h-11"
                      title="Baixa um TXT com dados brutos do TiFlux e do Zabbix para comparação."
                    >
                      {baixandoDump ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Baixando dump...
                        </>
                      ) : (
                        <>
                          <Download className="mr-2 h-4 w-4" />
                          Baixar dump (debug)
                        </>
                      )}
                    </Button>
                  ) : null}

                  <Button
                    onClick={() => void handleGenerate()}
                    disabled={carregando || gerando}
                    className="h-11"
                  >
                    {gerando ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Gerando...
                      </>
                    ) : (
                      "Gerar relatório"
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[0.9fr_1.1fr]">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm text-muted-foreground">
                  Último relatório gerado
                </CardTitle>
                <Button
                  variant="outline"
                  onClick={() => void refreshList()}
                  disabled={carregando}
                  className="h-9"
                >
                  Atualizar
                </Button>
              </CardHeader>

              <CardContent className="space-y-4">
                {carregando ? (
                  <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                    Carregando...
                  </div>
                ) : !lastReport ? (
                  <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                    Nenhum relatório encontrado para os filtros atuais.
                  </div>
                ) : (
                  <div className="rounded-xl border border-border bg-muted/40 p-4">
                    <p className="text-lg font-bold text-foreground">
                      Relatório Tipo {String(lastReport.type)}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Empresa: {lastReport.company?.name ?? "-"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Período:{" "}
                      {String(lastReport.periodStart).slice(0, 10)} até{" "}
                      {String(lastReport.periodEnd).slice(0, 10)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Formato: {lastReport.format}
                    </p>

                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                      <Button
                        onClick={() => void handleDownload(lastReport.id)}
                        className="h-10"
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Baixar
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">
                  Histórico (últimos 50)
                </CardTitle>
              </CardHeader>

              <CardContent>
                {carregando ? (
                  <div className="text-sm text-muted-foreground">Carregando...</div>
                ) : reports.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    Nenhum relatório ainda.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="text-xs uppercase text-muted-foreground">
                        <tr className="border-b border-border">
                          <th className="px-2 py-3">Tipo</th>
                          <th className="px-2 py-3">Empresa</th>
                          <th className="px-2 py-3">Período</th>
                          <th className="px-2 py-3">Formato</th>
                          <th className="px-2 py-3">Gerado em</th>
                          <th className="px-2 py-3 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reports.map((r) => (
                          <tr
                            key={r.id}
                            className="border-b border-border text-foreground"
                          >
                            <td className="px-2 py-3">Tipo {r.type}</td>
                            <td className="px-2 py-3">
                              {r.company?.name ?? "-"}
                            </td>
                            <td className="px-2 py-3">
                              {String(r.periodStart).slice(0, 10)} →{" "}
                              {String(r.periodEnd).slice(0, 10)}
                            </td>
                            <td className="px-2 py-3">{r.format}</td>
                            <td className="px-2 py-3">
                              {String(r.createdAt).slice(0, 19).replace("T", " ")}
                            </td>
                            <td className="px-2 py-3 text-right">
                              <Button
                                variant="outline"
                                onClick={() => void handleDownload(r.id)}
                                className="h-9"
                              >
                                <Download className="mr-2 h-4 w-4" />
                                Baixar
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
    </PermissionGate>
    </ProtectedPage>
  );
}