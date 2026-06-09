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
import { SearchableSelectField } from "@/components/ui/searchable-select-field";
import { FileText, Plus, Pencil, Trash2, Upload } from "lucide-react";
import { AppAlert } from "@/components/ui/app-alert";
import { ContractClassificationPicker } from "@/components/contracts/contract-classification-picker";
import { formatClassificationPath } from "@/lib/classification-path";
import {
  companyContractsService,
  type CompanyContract,
  type ContractStatus,
} from "@/lib/services/company-contracts.service";
import { financialService } from "@/lib/services/financial.service";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  empresaNome?: string;
}

function formatDate(date: string | null) {
  if (!date) return "—";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

function toInputDate(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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
  const [editing, setEditing] = useState<CompanyContract | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [classificationId, setClassificationId] = useState<string | null>(null);
  const [form, setForm] = useState<{
    title: string;
    description: string;
    status: ContractStatus;
    monthlyHours: string;
    extraHourPrice: string;
    startDate: string;
    endDate: string;
  }>({
    title: "",
    description: "",
    status: "ACTIVE",
    monthlyHours: "0",
    extraHourPrice: "0.00",
    startDate: "",
    endDate: "",
  });

  const activeCount = useMemo(
    () => contracts.filter((c) => c.status === "ACTIVE").length,
    [contracts],
  );

  async function refresh() {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await companyContractsService.list(companyId);
      setContracts(Array.isArray(res.contracts) ? res.contracts : []);
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
    setClassificationId(null);
    setForm({
      title: "",
      description: "",
      status: "ACTIVE",
      monthlyHours: "0",
      extraHourPrice: "0.00",
      startDate: "",
      endDate: "",
    });
  }

  function startEdit(c: CompanyContract) {
    setEditing(c);
    setClassificationId(c.classificationId ?? c.classification?.id ?? null);
    setForm({
      title: c.title ?? "",
      description: c.description ?? "",
      status: c.status,
      monthlyHours: String(c.monthlyHours ?? 0),
      extraHourPrice: String(c.extraHourPrice ?? "0.00"),
      startDate: toInputDate(c.startDate),
      endDate: toInputDate(c.endDate),
    });
  }

  async function save() {
    if (!companyId) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        status: form.status,
        monthlyHours: Number(form.monthlyHours || 0),
        extraHourPrice: form.extraHourPrice,
        startDate: form.startDate,
        endDate: form.endDate ? form.endDate : null,
        classificationId,
      };

      if (!payload.title) throw new Error("Título é obrigatório");
      if (!payload.startDate) throw new Error("Data de início é obrigatória");

      if (editing) {
        await companyContractsService.update(companyId, editing.id, payload);
        if (pendingFile) {
          await companyContractsService.uploadFile(companyId, editing.id, pendingFile);
        }
      } else {
        const created = await companyContractsService.create(companyId, payload);
        if (pendingFile) {
          await companyContractsService.uploadFile(companyId, created.id, pendingFile);
        }
      }

      setEditing(null);
      setPendingFile(null);
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
      if (editing?.id === deleteTargetId) setEditing(null);
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
                Gerencie horas/mês, valor excedente e arquivo do contrato da empresa{" "}
                <strong>{empresaNome}</strong>.
              </DialogDescription>
            </div>
          </DialogHeader>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6 space-y-4">
          {!companyId ? (
            <div className="rounded-2xl border border-border bg-muted/40 p-5 text-sm leading-relaxed text-muted-foreground">
              Selecione uma empresa para gerenciar contratos.
            </div>
          ) : (
            <>
              {error ? (
                <div className="alle-alert-error rounded-2xl p-4 text-sm">
                  {error}
                </div>
              ) : null}

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-muted-foreground">
                  {loading ? "Carregando..." : `${contracts.length} contrato(s) • ${activeCount} ativo(s)`}
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
                    <label className="text-xs font-semibold text-muted-foreground">Título</label>
                    <Input
                      value={form.title}
                      onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                      className="h-10"
                      placeholder="Ex.: Contrato 2026"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Status</label>
                    <SearchableSelectField
                      value={form.status}
                      onChange={(value) =>
                        setForm((p) => ({ ...p, status: value as ContractStatus }))
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
                    <label className="text-xs font-semibold text-muted-foreground">Horas/mês</label>
                    <Input
                      value={form.monthlyHours}
                      onChange={(e) => setForm((p) => ({ ...p, monthlyHours: e.target.value }))}
                      className="h-10"
                      inputMode="numeric"
                      placeholder="0"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Valor hora excedente (R$)</label>
                    <Input
                      value={form.extraHourPrice}
                      onChange={(e) => setForm((p) => ({ ...p, extraHourPrice: e.target.value }))}
                      className="h-10"
                      placeholder="0.00"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Início</label>
                    <Input
                      type="date"
                      value={form.startDate}
                      onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
                      className="h-10"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Fim (opcional)</label>
                    <Input
                      type="date"
                      value={form.endDate}
                      onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
                      className="h-10"
                    />
                  </div>

                  <ContractClassificationPicker
                    value={classificationId}
                    onChange={setClassificationId}
                    disabled={saving}
                  />

                  <div className="space-y-1 md:col-span-2">
                    <label className="text-xs font-semibold text-muted-foreground">Descrição (opcional)</label>
                    <Input
                      value={form.description}
                      onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
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
                      onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
                      className="h-10"
                    />
                    <div className="text-xs text-muted-foreground">
                      {pendingFile ? `Selecionado: ${pendingFile.name}` : "Você pode anexar no cadastro/edição."}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                  {editing ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10"
                      onClick={() => setEditing(null)}
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
                    {saving ? "Salvando..." : editing ? "Salvar alterações" : "Cadastrar contrato"}
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                {contracts.map((c) => {
                  const file = (c.contractFiles ?? []).find((f) => f.type === "CONTRACT");
                  return (
                    <div
                      key={c.id}
                      className="rounded-2xl border border-border bg-muted/40 p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-bold text-foreground">{c.title}</p>
                            <span className="rounded-full border border-border bg-background/40 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                              {c.status}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Vigência: {formatDate(c.startDate)}{" "}
                            {c.endDate ? `→ ${formatDate(c.endDate)}` : "→ (sem fim)"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {c.monthlyHours}h/mês • excedente: R$ {Number(c.extraHourPrice).toFixed(2)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Classificação:{" "}
                            <span className="font-semibold text-foreground">
                              {formatClassificationPath(c.classification)}
                            </span>
                          </p>
                          {file ? (
                            <p className="text-xs text-muted-foreground">
                              Arquivo: <span className="font-semibold text-foreground">{file.file.originalName}</span>
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">Sem arquivo anexado</p>
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

        <DialogFooter className="shrink-0 flex-col gap-3 border-t border-border bg-card px-5 py-4 sm:flex-row sm:px-6">
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
