"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRef } from "react";
import ModalNovaEmpresa from "@/components/modals/modal-nova-empresa";
import ModalContratosEmpresa from "@/components/modals/modal-contratos-empresa";
import {
  companiesService,
  type Company,
} from "@/lib/services/companies.service";
import { usersService, type Specialty } from "@/lib/services/users.service";
import { ZabbixGroupMultiSelectField } from "@/components/ui/zabbix-group-select-field";
import { TifluxClientSelectField } from "@/components/ui/tiflux-client-select-field";
import {
  getTifluxClients,
  type TifluxClient,
} from "@/lib/services/tiflux.service";
import {
  Building2,
  Plus,
  Pencil,
  Trash2,
  Search,
  FileText,
  ShieldCheck,
  ArrowRight,
  Upload,
  X,
} from "lucide-react";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import { AppAlert } from "@/components/ui/app-alert";
import { parseZabbixGroupNames } from "@/lib/zabbix-groups";

type EmpresaUI = {
  id: string;
  nome: string;
  responsavel: string;
  email: string;
  cnpj: string;
  endereco: string;
  zabbixGroupName: string;
  tifluxClientName: string;
  status: "Ativa" | "Inativa";
  contratos: number;
  documentos: number;
};

type EditCompanyForm = {
  id: string;
  name: string;
  responsibleName: string;
  email: string;
  cnpj: string;
  address: string;
  status: boolean;
  zabbixGroupName: string;
  tifluxClientId: number | null;
  tifluxClientName: string;
  monitoringPriority: boolean;
  modules: string[];
  ticketSpecialtyIds: string[];
};

function mapCompanyToUI(company: Company): EmpresaUI {
  return {
    id: company.id,
    nome: company.name,
    responsavel: company.responsibleName,
    email: company.email,
    cnpj: company.cnpj ?? "",
    endereco: company.address ?? "",
    zabbixGroupName: company.zabbixGroupName ?? "",
    tifluxClientName: company.tifluxClientName ?? "",
    status: company.status ? "Ativa" : "Inativa",
    contratos: Number(company.contractsCount ?? 0),
    documentos: Number(company.documentsCount ?? 0),
  };
}

function EditarEmpresaModal({
  open,
  onClose,
  form,
  onChange,
  onToggleModule,
  packModuleOptions,
  specialtyOptions,
  onToggleTicketSpecialty,
  onSubmit,
  salvando,
  tifluxClients,
  carregandoTiflux,
}: {
  open: boolean;
  onClose: () => void;
  form: EditCompanyForm | null;
  onChange: (
    field: keyof EditCompanyForm,
    value: string | boolean | number | null,
  ) => void;
  onToggleModule: (module: string) => void;
  packModuleOptions: string[];
  specialtyOptions: Specialty[];
  onToggleTicketSpecialty: (specialtyId: string) => void;
  onSubmit: () => void;
  salvando: boolean;
  tifluxClients: TifluxClient[];
  carregandoTiflux: boolean;
}) {
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoRemoved, setLogoRemoved] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  if (!open || !form) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 font-sans antialiased">
      <div
        className="
          flex max-h-[90vh] w-[95vw] max-w-[580px] flex-col overflow-hidden
          rounded-3xl border border-border bg-card shadow-2xl font-sans
          sm:max-w-[680px]
        "
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <div className="space-y-1">
            <h2 className="font-sans text-[28px] font-semibold leading-none tracking-normal text-foreground">
              Editar empresa
            </h2>
            <p className="font-sans text-sm font-normal leading-6 tracking-normal text-muted-foreground">
              Atualize os dados principais da empresa.
            </p>
          </div>

          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <label className="font-sans text-sm font-medium tracking-normal text-foreground">
                Nome da empresa
              </label>
              <Input
                value={form.name}
                onChange={(e) => onChange("name", e.target.value)}
                placeholder="Digite o nome da empresa"
                className="h-11 font-sans text-sm placeholder:font-sans"
              />
            </div>

            <div className="space-y-2">
              <label className="font-sans text-sm font-medium tracking-normal text-foreground">
                Responsável
              </label>
              <Input
                value={form.responsibleName}
                onChange={(e) => onChange("responsibleName", e.target.value)}
                placeholder="Digite o nome do responsável"
                className="h-11 font-sans text-sm placeholder:font-sans"
              />
            </div>

            <div className="space-y-2">
              <label className="font-sans text-sm font-medium tracking-normal text-foreground">
                E-mail
              </label>
              <Input
                value={form.email}
                onChange={(e) => onChange("email", e.target.value)}
                placeholder="Digite o e-mail da empresa"
                className="h-11 font-sans text-sm placeholder:font-sans"
              />
            </div>

            <div className="space-y-2">
              <label className="font-sans text-sm font-medium tracking-normal text-foreground">
                CNPJ
              </label>
              <Input
                value={form.cnpj}
                onChange={(e) => onChange("cnpj", e.target.value)}
                placeholder="00.000.000/0000-00"
                className="h-11 font-sans text-sm placeholder:font-sans"
              />
            </div>

            <div className="space-y-2">
              <label className="font-sans text-sm font-medium tracking-normal text-foreground">
                Endereço
              </label>
              <Input
                value={form.address}
                onChange={(e) => onChange("address", e.target.value)}
                placeholder="Rua, número, bairro, cidade"
                className="h-11 font-sans text-sm placeholder:font-sans"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="font-sans text-sm font-medium tracking-normal text-foreground">
                Logo da empresa
              </label>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={salvando || logoUploading}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setLogoError(null);
                    setLogoUploading(true);
                    try {
                      await companiesService.uploadLogo(form.id, file);
                      setLogoRemoved(false);
                    } catch (err) {
                      setLogoError(
                        err instanceof Error ? err.message : "Erro ao enviar logo",
                      );
                    } finally {
                      setLogoUploading(false);
                      e.target.value = "";
                    }
                  }}
                />

                <div className="flex items-center gap-3">
                  <div className="text-xs text-muted-foreground">
                    {logoUploading ? "Enviando..." : "PNG/JPG. Máx 5MB."}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10"
                    disabled={salvando || logoUploading}
                    onClick={() => fileRef.current?.click()}
                  >
                    Trocar logo
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10"
                    disabled={salvando || logoUploading}
                    onClick={async () => {
                      setLogoError(null);
                      setLogoUploading(true);
                      try {
                        await companiesService.removeLogo(form.id);
                        setLogoRemoved(true);
                      } catch (err) {
                        setLogoError(
                          err instanceof Error ? err.message : "Erro ao remover logo"
                        );
                      } finally {
                        setLogoUploading(false);
                      }
                    }}
                  >
                    Remover logo
                  </Button>
                </div>
              </div>

              {logoRemoved ? (
                <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                  Logo removida.
                </div>
              ) : null}

              {logoError ? (
                <div className="alle-alert-error rounded-xl p-3 text-sm">
                  {logoError}
                </div>
              ) : null}
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="font-sans text-sm font-medium tracking-normal text-foreground">
                Grupos Zabbix
              </label>

              <ZabbixGroupMultiSelectField
                value={form.zabbixGroupName}
                onChange={(next) => onChange("zabbixGroupName", next)}
              />
            </div>

            <div className="space-y-3 md:col-span-2">
              <label className="font-sans text-sm font-medium tracking-normal text-foreground">
                Console de operação
              </label>
              <button
                type="button"
                onClick={() =>
                  onChange("monitoringPriority", !form.monitoringPriority)
                }
                className={`font-sans flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition ${
                  form.monitoringPriority
                    ? "border-destructive/40 bg-destructive/10 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                }`}
              >
                <span
                  className={`inline-flex size-5 shrink-0 items-center justify-center rounded border text-xs font-bold ${
                    form.monitoringPriority
                      ? "border-destructive bg-destructive text-destructive-foreground"
                      : "border-border bg-muted"
                  }`}
                  aria-hidden
                >
                  {form.monitoringPriority ? "★" : ""}
                </span>
                <span>
                  <span className="block font-semibold text-foreground">
                    Empresa prioritária no Console
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Alertas desta empresa aparecem primeiro e no painel de
                    prioritários.
                  </span>
                </span>
              </button>
            </div>

            <div className="space-y-3 md:col-span-2">
              <label className="font-sans text-sm font-medium tracking-normal text-foreground">
                Módulos contratados (portal do cliente)
              </label>
              <p className="text-xs text-muted-foreground">
                Define o que usuários CLIENT_* desta empresa podem acessar.
                Colaboradores Alle não são afetados.
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {packModuleOptions.map((mod) => {
                  const checked = form.modules.includes(mod);
                  return (
                    <button
                      key={mod}
                      type="button"
                      onClick={() => onToggleModule(mod)}
                      className={`rounded-lg border px-3 py-2 text-left text-xs font-medium transition ${
                        checked
                          ? "border-primary/40 bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground hover:bg-muted/40"
                      }`}
                    >
                      {mod}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3 md:col-span-2">
              <label className="font-sans text-sm font-medium tracking-normal text-foreground">
                Catálogos para abertura de ticket (cliente)
              </label>
              <p className="text-xs text-muted-foreground">
                Define quais especialidades aparecem no formulário de novo ticket
                para usuários CLIENT_* desta empresa. Nenhuma seleção = todas
                liberadas.
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {specialtyOptions.map((item) => {
                  const checked = form.ticketSpecialtyIds.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onToggleTicketSpecialty(item.id)}
                      className={`rounded-lg border px-3 py-2 text-left text-xs font-medium transition ${
                        checked
                          ? "border-primary/40 bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground hover:bg-muted/40"
                      }`}
                    >
                      {item.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="font-sans text-sm font-medium tracking-normal text-foreground">
                Cliente vinculado
              </label>

              <TifluxClientSelectField
                value={form.tifluxClientId}
                selectedLabel={form.tifluxClientName}
                onChange={(clientId, clientName) => {
                  onChange("tifluxClientId", clientId);
                  onChange("tifluxClientName", clientName);
                }}
                clients={tifluxClients}
                loading={carregandoTiflux}
              />
            </div>

            <div className="space-y-3 md:col-span-2">
              <label className="font-sans text-sm font-medium tracking-normal text-foreground">
                Status
              </label>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => onChange("status", true)}
                  className={`font-sans rounded-xl border px-4 py-2 text-sm font-medium tracking-normal transition ${
                    form.status
                      ? "alle-badge-success font-semibold"
                      : "border-border bg-background text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  }`}
                >
                  Ativa
                </button>

                <button
                  type="button"
                  onClick={() => onChange("status", false)}
                  className={`font-sans rounded-xl border px-4 py-2 text-sm font-medium tracking-normal transition ${
                    !form.status
                      ? "alle-badge-danger font-semibold"
                      : "border-border bg-background text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  }`}
                >
                  Inativa
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-border px-6 py-5 sm:flex-row sm:justify-end">
          <Button
            type="button"
            onClick={onClose}
            variant="outline"
            className="font-sans text-sm font-medium tracking-normal"
          >
            Cancelar
          </Button>

          <Button
            type="button"
            onClick={onSubmit}
            disabled={salvando}
            className="font-sans text-sm font-medium tracking-normal disabled:opacity-50"
          >
            {salvando ? "Salvando..." : "Salvar alterações"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function InativarEmpresaModal({
  open,
  onClose,
  empresa,
  onConfirm,
  carregando,
}: {
  open: boolean;
  onClose: () => void;
  empresa: EmpresaUI | null;
  onConfirm: () => void;
  carregando: boolean;
}) {
  if (!open || !empresa) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 font-sans antialiased">
      <div className="w-full max-w-lg rounded-3xl border border-border bg-card shadow-2xl font-sans">
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <div className="space-y-1">
            <h2 className="font-sans text-[28px] font-semibold leading-none tracking-normal text-foreground">
              Inativar empresa
            </h2>
            <p className="font-sans text-sm font-normal leading-6 tracking-normal text-muted-foreground">
              A empresa continuará cadastrada, mas ficará com status inativo.
            </p>
          </div>

          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-6">
          <div className="alle-alert-error rounded-2xl p-4">
            <p className="font-sans text-sm font-normal leading-6 tracking-normal">
              Tem certeza que deseja inativar a empresa{" "}
              <span className="font-semibold">{empresa.nome}</span>?
            </p>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-border px-6 py-5 sm:flex-row sm:justify-end">
          <Button
            type="button"
            onClick={onClose}
            variant="outline"
            className="font-sans text-sm font-medium tracking-normal"
          >
            Cancelar
          </Button>

          <Button
            type="button"
            onClick={onConfirm}
            disabled={carregando}
            className="font-sans text-sm font-medium tracking-normal disabled:opacity-50"
            variant="destructive"
          >
            {carregando ? "Inativando..." : "Inativar empresa"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function AdminEmpresasPage() {
  const [modalNovaEmpresa, setModalNovaEmpresa] = useState(false);
  const [modalContratos, setModalContratos] = useState(false);
  const [empresaSelecionada, setEmpresaSelecionada] = useState<{
    id: string;
    nome: string;
  } | null>(null);
  const [busca, setBusca] = useState("");
  const [empresas, setEmpresas] = useState<EmpresaUI[]>([]);
  const [packModuleOptions, setPackModuleOptions] = useState<string[]>([
    "DASHBOARD",
    "FINANCIAL",
    "GMUD",
    "MONITORING",
    "TICKETS",
    "INVENTARIO",
    "PROJECTS",
    "RENDIMENTO",
    "REPORTS",
    "CONTRACTS",
  ]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [deletandoId, setDeletandoId] = useState<string | null>(null);

  const [modalEditarEmpresa, setModalEditarEmpresa] = useState(false);
  const [modalInativarEmpresa, setModalInativarEmpresa] = useState(false);
  const [empresaEdicao, setEmpresaEdicao] = useState<EditCompanyForm | null>(
    null,
  );
  const [empresaParaInativar, setEmpresaParaInativar] =
    useState<EmpresaUI | null>(null);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string>("");

  const [tifluxClients, setTifluxClients] = useState<TifluxClient[]>([]);
  const [carregandoTiflux, setCarregandoTiflux] = useState(false);
  const [specialtyOptions, setSpecialtyOptions] = useState<Specialty[]>([]);

  async function buscarEmpresas() {
    try {
      setCarregando(true);
      setErro("");

      const data = await companiesService.list();
      setEmpresas(
        data
          .map(mapCompanyToUI)
          .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível carregar as empresas.";

      setErro(message);
      setEmpresas([]);
    } finally {
      setCarregando(false);
    }
  }

  async function buscarTifluxClients() {
    try {
      setCarregandoTiflux(true);
      const data = await getTifluxClients();
      setTifluxClients(
        Array.isArray(data)
          ? [...data].sort((a, b) =>
              String(a.name ?? "").localeCompare(String(b.name ?? ""), "pt-BR"),
            )
          : [],
      );
    } catch (error) {
      console.error(error);
      setTifluxClients([]);
    } finally {
      setCarregandoTiflux(false);
    }
  }

  useEffect(() => {
    void buscarEmpresas();
    void buscarTifluxClients();
    void companiesService
      .listPackModuleOptions()
      .then((res) => {
        if (res.modules?.length) setPackModuleOptions(res.modules);
      })
      .catch(() => undefined);
    void usersService
      .listSpecialties()
      .then((rows) => setSpecialtyOptions(rows))
      .catch(() => undefined);
  }, []);

  const empresasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    const base = !termo
      ? empresas
      : empresas.filter((empresa) => {
      return (
        empresa.nome.toLowerCase().includes(termo) ||
        empresa.responsavel.toLowerCase().includes(termo) ||
        empresa.email.toLowerCase().includes(termo) ||
        empresa.cnpj.toLowerCase().includes(termo) ||
        empresa.endereco.toLowerCase().includes(termo) ||
        empresa.zabbixGroupName.toLowerCase().includes(termo) ||
        empresa.tifluxClientName.toLowerCase().includes(termo)
      );
    });
    return [...base].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [busca, empresas]);

  const totalEmpresas = empresasFiltradas.length;
  const totalEmpresasAtivas = empresasFiltradas.filter(
    (empresa) => empresa.status === "Ativa",
  ).length;
  const totalContratos = empresasFiltradas.reduce(
    (acc, item) => acc + item.contratos,
    0,
  );
  const totalDocumentos = empresasFiltradas.reduce(
    (acc, item) => acc + item.documentos,
    0,
  );

  async function handleAbrirEdicao(id: string) {
    try {
      const [company, modulesRes, ticketSpecialtiesRes] = await Promise.all([
        companiesService.getById(id),
        companiesService.getModules(id).catch(() => ({
          companyId: id,
          modules: [] as string[],
        })),
        companiesService.getTicketSpecialties(id).catch(() => ({
          companyId: id,
          specialtyIds: [] as string[],
        })),
      ]);

      setEmpresaEdicao({
        id: company.id,
        name: company.name,
        responsibleName: company.responsibleName,
        email: company.email,
        cnpj: company.cnpj ?? "",
        address: company.address ?? "",
        status: company.status,
        zabbixGroupName: company.zabbixGroupName ?? "",
        tifluxClientId: company.tifluxClientId ?? null,
        tifluxClientName: company.tifluxClientName ?? "",
        monitoringPriority: company.monitoringPriority ?? false,
        modules: modulesRes.modules ?? [],
        ticketSpecialtyIds: ticketSpecialtiesRes.specialtyIds ?? [],
      });

      setModalEditarEmpresa(true);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível carregar os dados da empresa.";

      setAlertMessage(message);
      setAlertOpen(true);
    }
  }

  function handleAlterarCampoEdicao(
    field: keyof EditCompanyForm,
    value: string | boolean | number | null,
  ) {
    setEmpresaEdicao((prev) => {
      if (!prev) {
        return prev;
      }

      return {
        ...prev,
        [field]: value,
      };
    });
  }

  function handleToggleModule(module: string) {
    setEmpresaEdicao((prev) => {
      if (!prev) return prev;
      const has = prev.modules.includes(module);
      return {
        ...prev,
        modules: has
          ? prev.modules.filter((m) => m !== module)
          : [...prev.modules, module],
      };
    });
  }

  function handleToggleTicketSpecialty(specialtyId: string) {
    setEmpresaEdicao((prev) => {
      if (!prev) return prev;
      const has = prev.ticketSpecialtyIds.includes(specialtyId);
      return {
        ...prev,
        ticketSpecialtyIds: has
          ? prev.ticketSpecialtyIds.filter((id) => id !== specialtyId)
          : [...prev.ticketSpecialtyIds, specialtyId],
      };
    });
  }

  async function handleSalvarEdicao() {
    if (!empresaEdicao) {
      return;
    }

    if (
      !empresaEdicao.name.trim() ||
      !empresaEdicao.responsibleName.trim() ||
      !empresaEdicao.email.trim()
    ) {
      setAlertMessage("Preencha nome, responsável e e-mail.");
      setAlertOpen(true);
      return;
    }

    try {
      setSalvandoEdicao(true);

      await companiesService.update(empresaEdicao.id, {
        name: empresaEdicao.name.trim(),
        responsibleName: empresaEdicao.responsibleName.trim(),
        email: empresaEdicao.email.trim(),
        cnpj: empresaEdicao.cnpj.trim() || undefined,
        address: empresaEdicao.address.trim() || undefined,
        zabbixGroupName: empresaEdicao.zabbixGroupName.trim() || undefined,
        tifluxClientId: empresaEdicao.tifluxClientId ?? undefined,
        tifluxClientName: empresaEdicao.tifluxClientName.trim() || undefined,
        status: empresaEdicao.status,
        monitoringPriority: empresaEdicao.monitoringPriority,
      });
      await companiesService.replaceModules(
        empresaEdicao.id,
        empresaEdicao.modules,
      );
      await companiesService.replaceTicketSpecialties(
        empresaEdicao.id,
        empresaEdicao.ticketSpecialtyIds,
      );

      setModalEditarEmpresa(false);
      setEmpresaEdicao(null);
      await buscarEmpresas();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar a empresa.";

      setAlertMessage(message);
      setAlertOpen(true);
    } finally {
      setSalvandoEdicao(false);
    }
  }

  function handleAbrirInativacao(empresa: EmpresaUI) {
    setEmpresaParaInativar(empresa);
    setModalInativarEmpresa(true);
  }

  async function handleConfirmarInativacao() {
    if (!empresaParaInativar) {
      return;
    }

    try {
      setDeletandoId(empresaParaInativar.id);

      await companiesService.update(empresaParaInativar.id, {
        status: false,
      });

      setModalInativarEmpresa(false);
      setEmpresaParaInativar(null);
      await buscarEmpresas();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível inativar a empresa.";

      setAlertMessage(message);
      setAlertOpen(true);
    } finally {
      setDeletandoId(null);
    }
  }

  return (
    <ProtectedPage>
      <PermissionGate module="COMPANIES">
      <AppShell>
        <div className="font-sans w-full space-y-8">
          <AppAlert
            open={alertOpen}
            onOpenChange={setAlertOpen}
            title="Atenção"
            description={alertMessage}
            variant="error"
          />
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold text-foreground">Empresas</h1>
              <p className="text-muted-foreground">
                Gerencie empresas, contratos e documentos do portal.
              </p>
            </div>

            <Button
              onClick={() => setModalNovaEmpresa(true)}
              className="h-11 gap-2"
            >
              <Plus size={18} />
              Nova empresa
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-4">
            <Card>
              <CardContent className="flex min-h-[132px] items-center justify-between p-6">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-muted-foreground">
                    Total de empresas
                  </p>
                  <p className="text-3xl font-bold">{totalEmpresas}</p>
                </div>

                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Building2 size={28} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex min-h-[132px] items-center justify-between p-6">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-muted-foreground">
                    Empresas ativas
                  </p>
                  <p className="text-3xl font-bold">{totalEmpresasAtivas}</p>
                </div>

                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600/15 text-emerald-700 dark:text-green-400">
                  <ShieldCheck size={28} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex min-h-[132px] items-center justify-between p-6">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-muted-foreground">
                    Contratos vinculados
                  </p>
                  <p className="text-3xl font-bold">{totalContratos}</p>
                </div>

                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/12 text-orange-400">
                  <FileText size={28} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex min-h-[132px] items-center justify-between p-6">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-muted-foreground">
                    Documentos anexados
                  </p>
                  <p className="text-3xl font-bold">{totalDocumentos}</p>
                </div>

                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/12 text-violet-400">
                  <Upload size={28} />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[1.2fr_0.8fr]">
            <Card>
              <CardContent className="space-y-6 p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-1">
                    <h2 className="text-xl font-bold text-foreground">
                      Cadastro de empresas
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Visualize, edite e gerencie os dados de cada empresa.
                    </p>
                  </div>

                  <div className="relative w-full max-w-md">
                    <Search
                      size={18}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                      placeholder="Buscar empresa..."
                      className="h-11 pl-10"
                    />
                  </div>
                </div>

                {carregando ? (
                  <div className="rounded-2xl border border-border bg-muted/40 p-6 text-sm text-muted-foreground">
                    Carregando empresas...
                  </div>
                ) : erro ? (
                  <div className="alle-alert-error rounded-2xl p-6 text-sm">
                    {erro}
                  </div>
                ) : empresasFiltradas.length === 0 ? (
                  <div className="rounded-2xl border border-border bg-muted/40 p-6 text-sm text-muted-foreground">
                    Nenhuma empresa encontrada.
                  </div>
                ) : (
                  <div className="relative isolate overflow-x-auto rounded-2xl border border-border">
                    <table className="min-w-[1200px] w-full border-separate border-spacing-0 text-left text-sm">
                      <thead className="bg-muted/40">
                        <tr className="text-muted-foreground">
                          <th className="px-4 py-4 font-semibold">Empresa</th>
                          <th className="px-4 py-4 font-semibold">
                            Responsável
                          </th>
                          <th className="px-4 py-4 font-semibold">E-mail</th>
                          <th className="px-4 py-4 font-semibold">CNPJ</th>
                          <th className="px-4 py-4 font-semibold">Endereço</th>
                          <th className="px-4 py-4 font-semibold">
                            Grupos Zabbix
                          </th>
                          <th className="px-4 py-4 font-semibold">
                            Cliente vinculado
                          </th>
                          <th className="px-4 py-4 font-semibold">Contratos</th>
                          <th className="px-4 py-4 font-semibold">Status</th>
                          <th className="sticky right-0 z-30 w-[200px] min-w-[200px] whitespace-nowrap border-l border-border bg-card px-4 py-4 font-semibold text-right shadow-[-4px_0_8px_-6px_rgba(0,0,0,0.16)]">
                            Ações
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {empresasFiltradas.map((empresa) => (
                          <tr
                            key={empresa.id}
                            className="group [&_td]:border-t [&_td]:border-border transition hover:bg-muted/30"
                          >
                            <td className="px-4 py-4">
                              <div className="flex min-w-[260px] items-center gap-3">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                  <Building2 size={20} />
                                </div>

                                <div className="min-w-0 space-y-1">
                                  <p className="break-words font-semibold leading-snug text-foreground">
                                    {empresa.nome}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {empresa.documentos} documentos vinculados
                                  </p>
                                </div>
                              </div>
                            </td>

                            <td className="px-4 py-4 text-muted-foreground">
                              {empresa.responsavel}
                            </td>

                            <td className="px-4 py-4 text-muted-foreground">
                              {empresa.email}
                            </td>

                            <td className="px-4 py-4 text-muted-foreground">
                              {empresa.cnpj || "--"}
                            </td>

                            <td className="px-4 py-4 text-muted-foreground">
                              {empresa.endereco || "--"}
                            </td>

                            <td className="px-4 py-4 text-muted-foreground">
                              {(() => {
                                const zabbixGroups = parseZabbixGroupNames(
                                  empresa.zabbixGroupName,
                                );
                                if (!zabbixGroups.length) return "--";
                                const visibleGroups = zabbixGroups.slice(0, 4);
                                const hiddenGroups = zabbixGroups.slice(4);
                                return (
                                  <div className="flex max-w-[280px] flex-wrap gap-1.5">
                                    {visibleGroups.map((group) => (
                                      <span
                                        key={group}
                                        className="inline-flex max-w-full rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-medium text-primary"
                                        title={group}
                                      >
                                        <span className="truncate">{group}</span>
                                      </span>
                                    ))}
                                    {hiddenGroups.length ? (
                                      <span
                                        className="inline-flex shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-[11px] font-medium text-muted-foreground"
                                        title={hiddenGroups.join(", ")}
                                      >
                                        +{hiddenGroups.length}
                                      </span>
                                    ) : null}
                                  </div>
                                );
                              })()}
                            </td>

                            <td className="px-4 py-4 text-muted-foreground">
                              {empresa.tifluxClientName || "--"}
                            </td>

                            <td className="px-4 py-4">
                              <span className="inline-flex items-center whitespace-nowrap rounded-full bg-primary/15 px-3 py-1 text-xs font-bold text-primary">
                                {empresa.contratos} contratos
                              </span>
                            </td>

                            <td className="px-4 py-4">
                              <span
                                className={`inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ${
                                  empresa.status === "Ativa"
                                    ? "alle-badge-success"
                                    : "alle-badge-danger"
                                }`}
                              >
                                {empresa.status}
                              </span>
                            </td>

                            <td className="sticky right-0 z-20 w-[200px] min-w-[200px] border-l border-border bg-card px-4 py-4 shadow-[-4px_0_8px_-6px_rgba(0,0,0,0.16)] group-hover:bg-[color-mix(in_srgb,var(--card)_88%,var(--foreground)_12%)]">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => {
                                    setEmpresaSelecionada({ id: empresa.id, nome: empresa.nome });
                                    setModalContratos(true);
                                  }}
                                  className="inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-xl border border-border bg-background/40 px-3 text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
                                >
                                  <FileText size={16} />
                                  <span className="text-xs font-semibold">
                                    Contratos
                                  </span>
                                </button>

                                <button
                                  onClick={() => void handleAbrirEdicao(empresa.id)}
                                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background/40 text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
                                  title="Editar empresa"
                                >
                                  <Pencil size={16} />
                                </button>

                                <button
                                  onClick={() => handleAbrirInativacao(empresa)}
                                  disabled={deletandoId === empresa.id}
                                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background/40 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
                                  title="Inativar empresa"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 text-sm font-semibold text-primary">
                  Ver gestão completa da empresa
                  <ArrowRight size={16} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex h-full flex-col justify-between p-6">
                <div className="space-y-5">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Building2 size={28} />
                  </div>

                  <div className="space-y-2">
                    <h2 className="text-2xl font-bold tracking-tight text-foreground">
                      Gestão documental
                    </h2>

                    <p className="text-sm leading-6 text-muted-foreground">
                      Centralize contratos e documentos por empresa para
                      disponibilização automática no módulo Financeiro.
                    </p>
                  </div>

                  <div className="rounded-xl border border-border bg-muted/40 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Pendências
                    </p>
                    <p className="mt-2 text-xl font-bold text-foreground">0</p>
                  </div>
                </div>

                <div className="mt-6 rounded-xl border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                  Área preparada para upload, substituição e remoção de
                  documentos por empresa.
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <ModalNovaEmpresa
          open={modalNovaEmpresa}
          onOpenChange={(open) => {
            setModalNovaEmpresa(open);

            if (!open) {
              void buscarEmpresas();
            }
          }}
        />

        <ModalContratosEmpresa
          open={modalContratos}
          onOpenChange={setModalContratos}
          companyId={empresaSelecionada?.id ?? null}
          empresaNome={empresaSelecionada?.nome ?? "Empresa"}
        />

        <EditarEmpresaModal
          open={modalEditarEmpresa}
          onClose={() => {
            if (salvandoEdicao) {
              return;
            }

            setModalEditarEmpresa(false);
            setEmpresaEdicao(null);
          }}
          form={empresaEdicao}
          onChange={handleAlterarCampoEdicao}
          onToggleModule={handleToggleModule}
          packModuleOptions={packModuleOptions}
          specialtyOptions={specialtyOptions}
          onToggleTicketSpecialty={handleToggleTicketSpecialty}
          onSubmit={() => void handleSalvarEdicao()}
          salvando={salvandoEdicao}
          tifluxClients={tifluxClients}
          carregandoTiflux={carregandoTiflux}
        />

        <InativarEmpresaModal
          open={modalInativarEmpresa}
          onClose={() => {
            if (deletandoId) {
              return;
            }

            setModalInativarEmpresa(false);
            setEmpresaParaInativar(null);
          }}
          empresa={empresaParaInativar}
          onConfirm={() => void handleConfirmarInativacao()}
          carregando={Boolean(
            empresaParaInativar && deletandoId === empresaParaInativar.id,
          )}
        />
      </AppShell>
      </PermissionGate>
    </ProtectedPage>
  );
}