"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Loader2, RefreshCw } from "lucide-react";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { SearchableSelectField } from "@/components/ui/searchable-select-field";
import { getStoredUser } from "@/lib/session";
import {
  getFormatsForReportType,
  getReportTypeLabel,
  REPORT_TYPES,
  type ReportFormatOption,
} from "@/lib/report-types";
import { reportsService } from "@/lib/services/reports.service";
import type { ReportRow } from "@/lib/services/reports.service";

export default function GeradorRelatoriosPage() {
  const user = useMemo(() => getStoredUser(), []);
  const [carregando, setCarregando] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState("");

  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>(
    []
  );
  const [companyId, setCompanyId] = useState<string>("");
  const [collaboratorId, setCollaboratorId] = useState<string>("");
  const [collaborators, setCollaborators] = useState<
    Array<{ id: string; name: string; hasTifluxLink?: boolean }>
  >([]);
  const [loadingCollaborators, setLoadingCollaborators] = useState(false);
  const [type, setType] = useState<string>("1");
  const [format, setFormat] = useState<ReportFormatOption>("XLSX");
  const [start, setStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().slice(0, 10);
  });
  const [end, setEnd] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const [lastReport, setLastReport] = useState<ReportRow | null>(null);
  const [reports, setReports] = useState<ReportRow[]>([]);

  const formatOptions = useMemo(
    () => getFormatsForReportType(type),
    [type],
  );
  const isRendimento = type === "1";
  const isEstatisticaGeral = type === "4";
  const alleCompanyId = useMemo(
    () =>
      companies.find((c) => c.name.trim().toLowerCase() === "alle")?.id ?? "",
    [companies],
  );
  const effectiveCompanyId = companyId;
  const companyOptions = useMemo(
    () => companies.map((c) => ({ value: c.id, label: c.name })),
    [companies],
  );
  const typeOptions = useMemo(
    () => REPORT_TYPES.map((t) => ({ value: t.value, label: t.label })),
    [],
  );
  const formatSelectOptions = useMemo(
    () => formatOptions.map((item) => ({ value: item, label: item })),
    [formatOptions],
  );
  const collaboratorOptions = useMemo(
    () => [
      { value: "", label: "Todos os colaboradores" },
      ...collaborators.map((c) => ({
        value: c.id,
        label: c.hasTifluxLink === false ? `${c.name} (sem TiFlux)` : c.name,
      })),
    ],
    [collaborators],
  );

  useEffect(() => {
    const allowed = getFormatsForReportType(type);
    if (!allowed.includes(format)) {
      setFormat(allowed[0] ?? "XLSX");
    }
  }, [type, format]);

  useEffect(() => {
    if (isEstatisticaGeral) {
      setCollaboratorId("");
    }
  }, [isEstatisticaGeral]);

  useEffect(() => {
    if (!isRendimento) {
      setCollaborators([]);
      setCollaboratorId("");
      return;
    }
    let cancelled = false;
    setLoadingCollaborators(true);
    void reportsService
      .listRendimentoCollaborators()
      .then((items) => {
        if (!cancelled) {
          const list = [...(items ?? [])].sort((a, b) =>
            a.name.localeCompare(b.name, "pt-BR"),
          );
          setCollaborators(
            list.map((c) => ({
              id: c.id,
              name: c.name,
              hasTifluxLink: c.hasTifluxLink,
            })),
          );
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setCollaborators([]);
          setErro(
            e instanceof Error
              ? e.message
              : "Falha ao carregar colaboradores para o relatório.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingCollaborators(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isRendimento, type]);

  async function loadAll() {
    setErro("");
    setCarregando(true);
    try {
      const comps = await reportsService.listCompanies();
      setCompanies(
        [...comps].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
      );

      const alleId =
        comps.find((c) => c.name.trim().toLowerCase() === "alle")?.id ?? "";
      const defaultCompanyId =
        alleId ||
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
        reportsService.list({ companyId: effectiveCompanyId || undefined, type }),
        reportsService.last({ companyId: effectiveCompanyId || undefined, type }),
      ]);
      setReports(items ?? []);
      setLastReport(last ?? null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao atualizar.");
    }
  }

  async function handleGenerate() {
    setErro("");

    if (!effectiveCompanyId) {
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
        companyId: effectiveCompanyId,
        type,
        format,
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        ...(isRendimento && collaboratorId ? { userId: collaboratorId } : {}),
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

  return (
    <ProtectedPage>
    <PermissionGate module="REPORTS">
    <AppShell>
      <div className="font-sans w-full space-y-6">
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
            <div className="alle-alert-error rounded-xl px-4 py-3 text-sm">
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
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Data inicial
                  </label>
                  <DatePickerField
                    value={start}
                    onChange={setStart}
                    max={end || undefined}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Data final
                  </label>
                  <DatePickerField
                    value={end}
                    onChange={setEnd}
                    min={start || undefined}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Empresa
                  </label>
                  <SearchableSelectField
                    value={companyId}
                    onChange={setCompanyId}
                    options={companyOptions}
                    loading={carregando}
                    disabled={carregando || companies.length === 0}
                    emptyLabel={carregando ? "Carregando..." : "Selecione"}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Colaborador
                  </label>
                  <SearchableSelectField
                    value={collaboratorId}
                    onChange={setCollaboratorId}
                    options={collaboratorOptions}
                    loading={loadingCollaborators}
                    disabled={
                      !isRendimento ||
                      isEstatisticaGeral ||
                      loadingCollaborators
                    }
                    placeholder={
                      !isRendimento
                        ? "Só no relatório Rendimento"
                        : "Todos os colaboradores"
                    }
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Relatório
                  </label>
                  <SearchableSelectField
                    value={type}
                    onChange={setType}
                    options={typeOptions}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Formato
                  </label>
                  <SearchableSelectField
                    value={format}
                    onChange={(value) => setFormat(value as ReportFormatOption)}
                    options={formatSelectOptions}
                    disabled={formatOptions.length <= 1}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  Rendimento: empresa padrão Alle (alterável); apontamentos dos
                  tickets da empresa no período; colaborador opcional. Estatística
                  Geral: visão da empresa (sem filtro por colaborador).
                </p>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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
                      Relatório {getReportTypeLabel(lastReport.type)}
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
                          <th className="px-2 py-3">Relatório</th>
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
                            <td className="px-2 py-3">
                              {getReportTypeLabel(r.type)}
                            </td>
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
    </AppShell>
    </PermissionGate>
    </ProtectedPage>
  );
}