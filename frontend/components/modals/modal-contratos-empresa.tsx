"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { SearchableSelectField } from "@/components/ui/searchable-select-field";
import { FlipCheckbox } from "@/components/ui/flip-checkbox";
import { FileText, Plus, Pencil, Trash2, Upload } from "lucide-react";
import { AppAlert } from "@/components/ui/app-alert";
import {
  companyContractsService,
  type CompanyContract,
  type ContractSpecialtyLinePayload,
  type ContractStatus,
} from "@/lib/services/company-contracts.service";
import { financialService } from "@/lib/services/financial.service";
import { usersService, type Specialty } from "@/lib/services/users.service";
import { formatDateDisplay } from "@/lib/date-utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  empresaNome?: string;
}

type SpecialtyLineForm = {
  key: string;
  specialtyId: string;
  monthlyHours: string;
  unlimited: boolean;
  contractValue: string;
  excessHourPrice: string;
};

function toInputDate(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function moneyLabel(value: string | number | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "R$ 0,00";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function emptyLine(): SpecialtyLineForm {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    specialtyId: "",
    monthlyHours: "0",
    unlimited: false,
    contractValue: "0.00",
    excessHourPrice: "0.00",
  };
}

function linesFromContract(c: CompanyContract): SpecialtyLineForm[] {
  const rows = Array.isArray(c.specialties) ? c.specialties : [];
  if (rows.length > 0) {
    return rows.map((row) => ({
      key: row.id,
      specialtyId: row.specialtyId,
      monthlyHours: String(row.monthlyHours ?? 0),
      unlimited: row.unlimited === true,
      contractValue: String(row.contractValue ?? "0.00"),
      excessHourPrice: String(row.excessHourPrice ?? "0.00"),
    }));
  }
  // Legado: 1 linha a partir dos campos antigos do contrato
  return [
    {
      key: `legacy-${c.id}`,
      specialtyId: "",
      monthlyHours: String(c.monthlyHours ?? 0),
      unlimited: false,
      contractValue: "0.00",
      excessHourPrice: String(c.extraHourPrice ?? "0.00"),
    },
  ];
}

export default function ModalContratosEmpresa({
  open,
  onOpenChange,
  companyId,
  empresaNome = "Empresa",
}: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contracts, setContracts] = useState<CompanyContract[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [editing, setEditing] = useState<CompanyContract | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [specialtyLines, setSpecialtyLines] = useState<SpecialtyLineForm[]>([
    emptyLine(),
  ]);
  const [form, setForm] = useState<{
    title: string;
    description: string;
    status: ContractStatus;
    startDate: string;
    endDate: string;
  }>({
    title: "",
    description: "",
    status: "ACTIVE",
    startDate: "",
    endDate: "",
  });

  const activeCount = useMemo(
    () => contracts.filter((c) => c.status === "ACTIVE").length,
    [contracts],
  );

  const specialtyOptions = useMemo(
    () =>
      specialties.map((s) => ({
        value: s.id,
        label: s.name,
      })),
    [specialties],
  );

  async function refresh() {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const [res, specs] = await Promise.all([
        companyContractsService.list(companyId),
        usersService.listSpecialties().catch(() => [] as Specialty[]),
      ]);
      setContracts(Array.isArray(res.contracts) ? res.contracts : []);
      setSpecialties(Array.isArray(specs) ? specs : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar contratos");
      setContracts([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, companyId]);

  function startNew() {
    setEditing(null);
    setPendingFile(null);
    setSpecialtyLines([emptyLine()]);
    setForm({
      title: "",
      description: "",
      status: "ACTIVE",
      startDate: "",
      endDate: "",
    });
  }

  function startEdit(c: CompanyContract) {
    setEditing(c);
    setPendingFile(null);
    setSpecialtyLines(linesFromContract(c));
    setForm({
      title: c.title ?? "",
      description: c.description ?? "",
      status: c.status,
      startDate: toInputDate(c.startDate),
      endDate: toInputDate(c.endDate),
    });
  }

  function updateLine(key: string, patch: Partial<SpecialtyLineForm>) {
    setSpecialtyLines((prev) =>
      prev.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function buildSpecialtyPayload(): ContractSpecialtyLinePayload[] {
    const cleaned = specialtyLines
      .filter((line) => line.specialtyId)
      .map((line) => ({
        specialtyId: line.specialtyId,
        monthlyHours: Number(line.monthlyHours || 0),
        unlimited: line.unlimited,
        contractValue: String(line.contractValue || "0").replace(",", "."),
        excessHourPrice: String(line.excessHourPrice || "0").replace(",", "."),
      }));

    if (cleaned.length === 0) {
      throw new Error("Inclua ao menos uma especialidade no contrato.");
    }

    const ids = cleaned.map((l) => l.specialtyId);
    if (new Set(ids).size !== ids.length) {
      throw new Error("Não repita a mesma especialidade em mais de uma linha.");
    }

    for (const line of cleaned) {
      if (!Number.isFinite(line.monthlyHours) || line.monthlyHours < 0) {
        throw new Error("Horas/mês inválidas em uma das especialidades.");
      }
      if (!line.unlimited && line.monthlyHours <= 0) {
        throw new Error(
          "Informe horas/mês (> 0) ou marque ilimitado na especialidade.",
        );
      }
      if (!Number.isFinite(Number(line.contractValue))) {
        throw new Error("Valor do contrato inválido.");
      }
      if (!Number.isFinite(Number(line.excessHourPrice))) {
        throw new Error("Valor hora excedente inválido.");
      }
    }

    return cleaned;
  }

  async function save() {
    if (!companyId) return;
    setSaving(true);
    setError(null);
    try {
      const specialtiesPayload = buildSpecialtyPayload();
      const first = specialtiesPayload[0];
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        status: form.status,
        startDate: form.startDate,
        endDate: form.endDate ? form.endDate : null,
        specialties: specialtiesPayload,
        monthlyHours: first.monthlyHours,
        extraHourPrice: first.excessHourPrice,
        classificationId: null,
      };

      if (!payload.title) throw new Error("Título é obrigatório");
      if (!payload.startDate) throw new Error("Data de início é obrigatória");

      if (editing) {
        await companyContractsService.update(companyId, editing.id, payload);
        if (pendingFile) {
          await companyContractsService.uploadFile(
            companyId,
            editing.id,
            pendingFile,
          );
        }
      } else {
        const created = await companyContractsService.create(companyId, payload);
        if (pendingFile) {
          await companyContractsService.uploadFile(
            companyId,
            created.id,
            pendingFile,
          );
        }
      }

      setEditing(null);
      setPendingFile(null);
      startNew();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar contrato");
    } finally {
      setSaving(false);
    }
  }

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  async function removeConfirmed() {
    if (!companyId || !deleteTargetId) return;
    setSaving(true);
    setError(null);
    try {
      await companyContractsService.remove(companyId, deleteTargetId);
      if (editing?.id === deleteTargetId) startNew();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao excluir contrato");
    } finally {
      setSaving(false);
      setDeleteConfirmOpen(false);
      setDeleteTargetId(null);
    }
  }

  async function upload(contractId: string, file: File) {
    if (!companyId) return;
    setSaving(true);
    setError(null);
    try {
      await companyContractsService.uploadFile(companyId, contractId, file);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao enviar arquivo");
    } finally {
      setSaving(false);
    }
  }

  async function download(contractId: string) {
    if (!companyId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await financialService.downloadContractFile({
        contractId,
        companyId,
      });
      const url = URL.createObjectURL(res.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao baixar arquivo");
    } finally {
      setSaving(false);
    }
  }

  async function view(contractId: string) {
    if (!companyId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await financialService.downloadContractFile({
        contractId,
        companyId,
        inline: true,
      });
      const url = URL.createObjectURL(res.blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao visualizar arquivo");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppAlert
        open={deleteConfirmOpen}
        onOpenChange={(o) => {
          if (saving) return;
          setDeleteConfirmOpen(o);
          if (!o) setDeleteTargetId(null);
        }}
        title="Confirmar exclusão"
        description="Tem certeza que deseja excluir este contrato?"
        variant="warning"
        confirmText={saving ? "Excluindo..." : "Excluir"}
        cancelText="Cancelar"
        onConfirm={() => void removeConfirmed()}
      />
      <AppAlert
        open={Boolean(error)}
        onOpenChange={(o) => {
          if (!o) setError(null);
        }}
        title="Atenção"
        description={error}
        variant="error"
      />
      <DialogContent
        className="
          font-sans
          flex max-h-[92vh] w-[98vw] max-w-[1100px] flex-col overflow-hidden
          border border-border bg-card p-0 text-card-foreground
          lg:max-w-[1240px]
        "
      >
        <div className="shrink-0 border-b border-border px-5 py-5 sm:px-6">
          <DialogHeader className="space-y-3 text-left">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary sm:h-12 sm:w-12">
              <FileText size={22} />
            </div>

            <div className="space-y-1">
              <DialogTitle className="text-xl font-bold text-foreground sm:text-2xl">
                Contratos
              </DialogTitle>

              <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
                Cadastre especialidades com horas, <strong>valor do contrato</strong>,
                hora excedente e flag ilimitado — empresa{" "}
                <strong>{empresaNome}</strong>.
              </DialogDescription>
            </div>
          </DialogHeader>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
          {!companyId ? (
            <div className="rounded-2xl border border-border bg-muted/40 p-5 text-sm leading-relaxed text-muted-foreground">
              Selecione uma empresa para gerenciar contratos.
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-muted-foreground">
                  {loading
                    ? "Carregando..."
                    : `${contracts.length} contrato(s) • ${activeCount} ativo(s)`}
                </div>
                {editing ? (
                  <Button
                    type="button"
                    onClick={startNew}
                    className="h-10"
                    variant="secondary"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Novo contrato
                  </Button>
                ) : null}
              </div>

              <div className="rounded-2xl border border-border bg-muted/40 p-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">
                      Título
                    </label>
                    <Input
                      value={form.title}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, title: e.target.value }))
                      }
                      className="h-10"
                      placeholder="Ex.: Contrato 2026"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">
                      Status
                    </label>
                    <SearchableSelectField
                      value={form.status}
                      onChange={(value) =>
                        setForm((p) => ({
                          ...p,
                          status: value as ContractStatus,
                        }))
                      }
                      options={[
                        { value: "ACTIVE", label: "Ativo" },
                        { value: "EXPIRED", label: "Expirado" },
                        { value: "INACTIVE", label: "Inativo" },
                      ]}
                      className="h-10"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">
                      Início
                    </label>
                    <DatePickerField
                      modal
                      value={form.startDate}
                      onChange={(startDate) =>
                        setForm((p) => ({ ...p, startDate }))
                      }
                      max={form.endDate || undefined}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">
                      Fim (opcional)
                    </label>
                    <DatePickerField
                      modal
                      allowClear
                      value={form.endDate}
                      onChange={(endDate) => setForm((p) => ({ ...p, endDate }))}
                      min={form.startDate || undefined}
                      placeholder="Sem data de fim"
                    />
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <label className="text-xs font-semibold text-muted-foreground">
                      Descrição (opcional)
                    </label>
                    <Input
                      value={form.description}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, description: e.target.value }))
                      }
                      className="h-10"
                      placeholder="Observações do contrato"
                    />
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <label className="text-xs font-semibold text-muted-foreground">
                      Arquivo do contrato (opcional)
                    </label>
                    <Input
                      type="file"
                      disabled={saving}
                      onChange={(e) =>
                        setPendingFile(e.target.files?.[0] ?? null)
                      }
                      className="h-10"
                    />
                    <div className="text-xs text-muted-foreground">
                      {pendingFile
                        ? `Selecionado: ${pendingFile.name}`
                        : "Você pode anexar no cadastro/edição."}
                    </div>
                  </div>
                </div>

                <div className="mt-5 space-y-3 border-t border-border pt-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Especialidades do contrato
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Cada linha: horas, valor do contrato, hora excedente e
                        ilimitado.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9"
                      onClick={() =>
                        setSpecialtyLines((prev) => [...prev, emptyLine()])
                      }
                      disabled={saving}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Adicionar especialidade
                    </Button>
                  </div>

                  {specialtyLines.map((line, index) => {
                    const hours = Number(line.monthlyHours || 0);
                    const value = Number(
                      String(line.contractValue || "0").replace(",", "."),
                    );
                    const hourlyRate =
                      !line.unlimited && hours > 0 && Number.isFinite(value)
                        ? value / hours
                        : null;

                    return (
                      <div
                        key={line.key}
                        className="rounded-xl border border-border bg-background/40 p-3"
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Linha {index + 1}
                          </p>
                          {specialtyLines.length > 1 ? (
                            <Button
                              type="button"
                              variant="ghost"
                              className="h-8 px-2 text-destructive"
                              onClick={() =>
                                setSpecialtyLines((prev) =>
                                  prev.filter((l) => l.key !== line.key),
                                )
                              }
                              disabled={saving}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <div className="space-y-1 md:col-span-2">
                            <label className="text-xs font-semibold text-muted-foreground">
                              Especialidade
                            </label>
                            <SearchableSelectField
                              value={line.specialtyId}
                              onChange={(specialtyId) =>
                                updateLine(line.key, { specialtyId })
                              }
                              options={specialtyOptions}
                              emptyLabel="Selecione a especialidade"
                              modal
                              className="h-10"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-muted-foreground">
                              Horas/mês
                            </label>
                            <Input
                              value={line.monthlyHours}
                              onChange={(e) =>
                                updateLine(line.key, {
                                  monthlyHours: e.target.value,
                                })
                              }
                              className="h-10"
                              inputMode="numeric"
                              disabled={line.unlimited || saving}
                              placeholder="0"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-muted-foreground">
                              Valor do contrato (R$)
                            </label>
                            <Input
                              value={line.contractValue}
                              onChange={(e) =>
                                updateLine(line.key, {
                                  contractValue: e.target.value,
                                })
                              }
                              className="h-10"
                              placeholder="0.00"
                              disabled={saving}
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-muted-foreground">
                              Valor hora excedente (R$)
                            </label>
                            <Input
                              value={line.excessHourPrice}
                              onChange={(e) =>
                                updateLine(line.key, {
                                  excessHourPrice: e.target.value,
                                })
                              }
                              className="h-10"
                              placeholder="0.00"
                              disabled={line.unlimited || saving}
                            />
                          </div>

                          <div className="flex items-end">
                            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-muted/20 px-3 py-2.5 text-sm">
                              <FlipCheckbox
                                checked={line.unlimited}
                                onChange={() =>
                                  updateLine(line.key, {
                                    unlimited: !line.unlimited,
                                  })
                                }
                                disabled={saving}
                              />
                              <span className="font-medium text-foreground">
                                Ilimitado (sem teto de horas)
                              </span>
                            </label>
                          </div>
                        </div>

                        <p className="mt-2 text-[11px] text-muted-foreground">
                          Valor hora calculado:{" "}
                          {hourlyRate == null
                            ? "—"
                            : moneyLabel(hourlyRate)}
                          {line.unlimited
                            ? " (ilimitado: cobra só o valor do contrato)"
                            : null}
                        </p>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                  {editing ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10"
                      onClick={startNew}
                      disabled={saving}
                    >
                      Cancelar edição
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    className="h-10"
                    onClick={() => void save()}
                    disabled={saving}
                  >
                    {saving
                      ? "Salvando..."
                      : editing
                        ? "Salvar alterações"
                        : "Cadastrar contrato"}
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                {contracts.map((c) => {
                  const file = (c.contractFiles ?? []).find(
                    (f) => f.type === "CONTRACT",
                  );
                  const lines =
                    Array.isArray(c.specialties) && c.specialties.length > 0
                      ? c.specialties
                      : null;

                  return (
                    <div
                      key={c.id}
                      className="rounded-2xl border border-border bg-muted/40 p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-bold text-foreground">
                              {c.title}
                            </p>
                            <span className="rounded-full border border-border bg-background/40 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                              {c.status}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Vigência: {formatDateDisplay(c.startDate)}{" "}
                            {c.endDate
                              ? `→ ${formatDateDisplay(c.endDate)}`
                              : "→ (sem fim)"}
                          </p>

                          {lines ? (
                            <div className="space-y-1 pt-1">
                              {lines.map((line) => (
                                <p
                                  key={line.id}
                                  className="text-xs text-muted-foreground"
                                >
                                  <span className="font-semibold text-foreground">
                                    {line.specialty?.name ?? "Especialidade"}
                                  </span>
                                  {": "}
                                  {line.unlimited
                                    ? "ilimitado"
                                    : `${line.monthlyHours}h/mês`}
                                  {" • valor "}
                                  {moneyLabel(line.contractValue)}
                                  {!line.unlimited
                                    ? ` • excedente ${moneyLabel(line.excessHourPrice)}`
                                    : null}
                                </p>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              {c.monthlyHours}h/mês • excedente:{" "}
                              {moneyLabel(c.extraHourPrice)} (legado — edite para
                              incluir especialidades)
                            </p>
                          )}

                          {file ? (
                            <p className="text-xs text-muted-foreground">
                              Arquivo:{" "}
                              <span className="font-semibold text-foreground">
                                {file.file.originalName}
                              </span>
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              Sem arquivo anexado
                            </p>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {file ? (
                            <>
                              <Button
                                type="button"
                                variant="outline"
                                className="h-9"
                                onClick={() => void view(c.id)}
                                disabled={saving}
                              >
                                Visualizar
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                className="h-9"
                                onClick={() => void download(c.id)}
                                disabled={saving}
                              >
                                <FileText className="mr-2 h-4 w-4" />
                                Baixar
                              </Button>
                            </>
                          ) : null}
                          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-background/40 px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted/40">
                            <Upload className="h-4 w-4" />
                            <span>Enviar arquivo</span>
                            <input
                              type="file"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (!f) return;
                                void upload(c.id, f);
                                e.target.value = "";
                              }}
                              disabled={saving}
                            />
                          </label>

                          <Button
                            type="button"
                            variant="outline"
                            className="h-9"
                            onClick={() => startEdit(c)}
                            disabled={saving}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            Editar
                          </Button>

                          <Button
                            type="button"
                            variant="destructive"
                            className="h-9"
                            onClick={() => {
                              setDeleteTargetId(c.id);
                              setDeleteConfirmOpen(true);
                            }}
                            disabled={saving}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Excluir
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="!mx-0 shrink-0 flex-col gap-3 border-t border-border bg-card px-5 pt-4 sm:flex-row sm:px-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-11 w-full sm:w-auto"
          >
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
