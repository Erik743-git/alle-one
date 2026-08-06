"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, Download, Loader2, RefreshCw } from "lucide-react";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { SearchableSelectField } from "@/components/ui/searchable-select-field";
import { Input } from "@/components/ui/input";
import { isClientPortalRole } from "@/lib/app-roles";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAuth } from "@/lib/use-auth";
import {
  pickCompanyIdFromList,
  setPersistedCompanyId,
} from "@/lib/selected-company";
import {
  ALL_COMPANIES_REPORT_VALUE,
  getFormatsForReportType,
  getReportTypeLabel,
  reportTypeRequiresPeriod,
  reportTypeSupportsCollaborator,
  reportTypeSupportsMultiCompany,
  REPORT_TYPES,
  type ReportFormatOption,
} from "@/lib/report-types";
import { reportsService } from "@/lib/services/reports.service";
import type { ReportRow } from "@/lib/services/reports.service";
import { FlipCheckbox } from "@/components/ui/flip-checkbox";

function getReportCompanyLabel(report: ReportRow): string {
  if (report.filters?.allCompanies) {
    return report.filters.companyLabel ?? "Todas as empresas";
  }
  return report.company?.name ?? "-";
}

function getReportPeriodLabel(report: ReportRow): string {
  if (report.filters?.noPeriod) return "Sem período";
  return `${String(report.periodStart).slice(0, 10)} até ${String(report.periodEnd).slice(0, 10)}`;
}

function getReportPeriodTableLabel(report: ReportRow): string {
  if (report.filters?.noPeriod) return "Sem período";
  return `${String(report.periodStart).slice(0, 10)} → ${String(report.periodEnd).slice(0, 10)}`;
}

export default function GeradorRelatoriosPage() {
  const { user } = useAuth();
  const [carregando, setCarregando] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState("");

  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>(
    []
  );
  const [companyId, setCompanyId] = useState<string>("");
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([]);
  const [companySearch, setCompanySearch] = useState("");
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
  const isInventario = reportTypeSupportsMultiCompany(type);
  const requiresPeriod = reportTypeRequiresPeriod(type);
  const supportsCollaborator = reportTypeSupportsCollaborator(type);
  const alleCompanyId = useMemo(
    () =>
      companies.find((c) => c.name.trim().toLowerCase() === "alle")?.id ?? "",
    [companies],
  );
  const effectiveCompanyId = companyId;
  const allInventarioCompaniesSelected =
    isInventario &&
    companies.length > 0 &&
    selectedCompanyIds.length === companies.length;
  const listCompanyFilter = isInventario
    ? allInventarioCompaniesSelected
      ? ALL_COMPANIES_REPORT_VALUE
      : selectedCompanyIds.length === 1
        ? selectedCompanyIds[0]
        : undefined
    : effectiveCompanyId;
  const canSelectAllCompanies =
    isRendimento && user?.role !== "CLIENT";
  const companyOptions = useMemo(() => {
    const items = companies.map((c) => ({ value: c.id, label: c.name }));
    if (canSelectAllCompanies) {
      return [
        { value: ALL_COMPANIES_REPORT_VALUE, label: "Todas as empresas" },
        ...items,
      ];
    }
    return items;
  }, [companies, canSelectAllCompanies]);
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
        label: c.hasTifluxLink === false ? `${c.name} (sem vínculo)` : c.name,
      })),
    ],
    [collaborators],
  );
  const filteredInventarioCompanies = useMemo(() => {
    const term = companySearch.trim().toLowerCase();
    if (!term) return companies;
    return companies.filter((company) =>
      company.name.toLowerCase().includes(term),
    );
  }, [companies, companySearch]);
  const inventarioCompanySummary = useMemo(() => {
    if (selectedCompanyIds.length === 0) return "Selecione empresas";
    if (allInventarioCompaniesSelected) return "Todas as empresas";
    if (selectedCompanyIds.length === 1) {
      return (
        companies.find((company) => company.id === selectedCompanyIds[0])
          ?.name ?? "1 empresa selecionada"
      );
    }
    return `${selectedCompanyIds.length} empresas selecionadas`;
  }, [allInventarioCompaniesSelected, companies, selectedCompanyIds]);

  useEffect(() => {
    if (isInventario) {
      setSelectedCompanyIds((prev) => {
        if (prev.length > 0 && prev.every((id) => companies.some((c) => c.id === id))) {
          return prev;
        }
        const fallback =
          (companyId && companyId !== ALL_COMPANIES_REPORT_VALUE
            ? companyId
            : null) ??
          alleCompanyId ??
          companies[0]?.id ??
          "";
        return fallback ? [fallback] : [];
      });
      return;
    }
    if (isRendimento && canSelectAllCompanies) {
      setCompanyId((prev) =>
        prev === ALL_COMPANIES_REPORT_VALUE || companies.some((c) => c.id === prev)
          ? prev || ALL_COMPANIES_REPORT_VALUE
          : ALL_COMPANIES_REPORT_VALUE,
      );
      return;
    }
    if (companyId === ALL_COMPANIES_REPORT_VALUE) {
      setCompanyId(alleCompanyId || companies[0]?.id || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRendimento, isInventario, canSelectAllCompanies, type, companies.length]);

  useEffect(() => {
    const allowed = getFormatsForReportType(type);
    if (!allowed.includes(format)) {
      setFormat(allowed[0] ?? "XLSX");
    }
  }, [type, format]);

  useEffect(() => {
    if (!supportsCollaborator) {
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
  }, [supportsCollaborator, type]);

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
      const canAll =
        (type || "1") === "1" && user?.role !== "CLIENT";
      const defaultCompanyId = canAll
        ? ALL_COMPANIES_REPORT_VALUE
        : pickCompanyIdFromList(comps, {
            userId: user?.id,
            preferredIds: [
              companyId === ALL_COMPANIES_REPORT_VALUE ? null : companyId,
              alleId,
              isClientPortalRole(user?.role) ? user.companyId : null,
            ],
          }) ?? "";

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
        reportsService.list({ companyId: listCompanyFilter || undefined, type }),
        reportsService.last({ companyId: listCompanyFilter || undefined, type }),
      ]);
      setReports(items ?? []);
      setLastReport(last ?? null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao atualizar.");
    }
  }

  function toggleInventarioCompany(id: string) {
    setSelectedCompanyIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  function selectAllInventarioCompanies() {
    setSelectedCompanyIds(companies.map((c) => c.id));
  }

  function clearInventarioCompanies() {
    setSelectedCompanyIds([]);
  }

  async function handleGenerate() {
    setErro("");

    const isAllCompanies =
      isRendimento && effectiveCompanyId === ALL_COMPANIES_REPORT_VALUE;

    if (isInventario) {
      if (selectedCompanyIds.length === 0) {
        setErro("Selecione ao menos uma empresa.");
        return;
      }
    } else if (!effectiveCompanyId && !isAllCompanies) {
      setErro("Selecione a empresa.");
      return;
    } else if (!isRendimento && effectiveCompanyId === ALL_COMPANIES_REPORT_VALUE) {
      setErro("Selecione uma empresa para este tipo de relatório.");
      return;
    }
    if (requiresPeriod) {
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
    }

    try {
      setGerando(true);
      await reportsService.generate({
        companyId: isInventario
          ? allInventarioCompaniesSelected
            ? ALL_COMPANIES_REPORT_VALUE
            : selectedCompanyIds[0]
          : isAllCompanies
            ? ALL_COMPANIES_REPORT_VALUE
            : effectiveCompanyId,
        type,
        format,
        ...(requiresPeriod ? { start, end } : {}),
        ...(supportsCollaborator && collaboratorId ? { userId: collaboratorId } : {}),
        ...(isInventario &&
        selectedCompanyIds.length > 1 &&
        !allInventarioCompaniesSelected
          ? { companyIds: selectedCompanyIds }
          : {}),
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
                    disabled={!requiresPeriod}
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
                    disabled={!requiresPeriod}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Empresa{isInventario ? "s" : ""}
                  </label>
                  {isInventario ? (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={carregando || companies.length === 0}
                          className="h-11 w-full justify-between px-3 font-normal"
                        >
                          <span className="min-w-0 truncate text-left">
                            {inventarioCompanySummary}
                          </span>
                          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-70" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[min(92vw,380px)] p-3">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-muted-foreground">
                              {selectedCompanyIds.length} de {companies.length}
                            </span>
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={selectAllInventarioCompanies}
                                disabled={companies.length === 0}
                                className="h-8"
                              >
                                Todas
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={clearInventarioCompanies}
                                disabled={selectedCompanyIds.length === 0}
                                className="h-8"
                              >
                                Limpar
                              </Button>
                            </div>
                          </div>

                          <Input
                            value={companySearch}
                            onChange={(event) =>
                              setCompanySearch(event.target.value)
                            }
                            placeholder="Buscar empresa..."
                          />

                          <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                            {filteredInventarioCompanies.length === 0 ? (
                              <p className="px-2 py-3 text-sm text-muted-foreground">
                                Nenhuma empresa encontrada.
                              </p>
                            ) : (
                              filteredInventarioCompanies.map((company) => {
                                const checked = selectedCompanyIds.includes(
                                  company.id,
                                );
                                return (
                                  <label
                                    key={company.id}
                                    className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/60"
                                  >
                                    <FlipCheckbox
                                      checked={checked}
                                      onChange={() =>
                                        toggleInventarioCompany(company.id)
                                      }
                                      aria-label={company.name}
                                    />
                                    <span className="min-w-0 truncate text-sm text-foreground">
                                      {company.name}
                                    </span>
                                  </label>
                                );
                              })
                            )}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <SearchableSelectField
                      value={companyId}
                      onChange={(id) => {
                        setCompanyId(id);
                        if (
                          user?.id &&
                          id &&
                          id !== ALL_COMPANIES_REPORT_VALUE
                        ) {
                          setPersistedCompanyId(user.id, id);
                        }
                      }}
                      options={companyOptions}
                      loading={carregando}
                      disabled={carregando || companies.length === 0}
                      preserveOrder={canSelectAllCompanies}
                      emptyLabel={
                        canSelectAllCompanies
                          ? ""
                          : carregando
                            ? "Carregando..."
                            : "Selecione"
                      }
                    />
                  )}
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
                    preserveOrder
                    disabled={
                      !supportsCollaborator ||
                      loadingCollaborators
                    }
                    placeholder={
                      !supportsCollaborator
                        ? "Só no relatório de Apontamentos"
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
                  Apontamentos: horas dos colaboradores nos tickets da empresa
                  selecionada no período; use &quot;Todas as empresas&quot; para
                  visão geral. Colaborador opcional. Estatística Geral: visão
                  Zabbix/chamados de uma empresa (sem colaborador); CSV com as
                  mesmas tabelas do XLSX (gráficos só no XLSX). Inventário:
                  snapshot dos ativos das empresas selecionadas (sem período e
                  sem colaborador), em CSV ou XLSX — use &quot;Selecionar
                  todas&quot; para incluir todas as empresas.
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
                      Empresa: {getReportCompanyLabel(lastReport)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Período: {getReportPeriodLabel(lastReport)}
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
                              {getReportCompanyLabel(r)}
                            </td>
                            <td className="px-2 py-3">
                              {getReportPeriodTableLabel(r)}
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