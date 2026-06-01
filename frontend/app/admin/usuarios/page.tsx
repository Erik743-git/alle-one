"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { FlipCheckbox } from "@/components/ui/flip-checkbox";
import { SearchableSelectField } from "@/components/ui/searchable-select-field";
import ModalNovoUsuario from "@/components/modals/modal-novo-usuario";
import ModalPermissoesUsuario from "@/components/modals/modal-permissoes-usuario";
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  Search,
  ShieldCheck,
  Building2,
  ChevronDown,
  UserCog,
  TriangleAlert,
} from "lucide-react";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import { authFetch } from "@/lib/auth-fetch";

type ApiUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "COLLABORATOR" | "PJ" | "CLIENT";
  status: "ACTIVE" | "INACTIVE";
  firstAccess: boolean;
  responsible: boolean;
  companyId: string | null;
  serviceDesks: Array<{
    id: string;
    name: string;
    externalId: number | null;
  }>;
  company?: {
    id: string;
    name: string;
  } | null;
};

type EmpresaApi = {
  id: string;
  name: string;
  responsibleName: string;
  email: string;
  status: boolean;
};

type UsuarioUI = {
  id: string;
  nome: string;
  email: string;
  perfil: "Admin" | "Colaborador" | "PJ" | "Cliente";
  status: "Ativo" | "Inativo";
};

type GrupoEmpresa = {
  empresa: string;
  usuarios: UsuarioUI[];
};

type FormEdicao = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "COLLABORATOR" | "PJ" | "CLIENT";
  status: "ACTIVE" | "INACTIVE";
  companyId: string;
  firstAccess: boolean;
  responsible: boolean;
  serviceDeskIds: string[];
};

type ServiceDeskOption = {
  id: string;
  name: string;
  externalId: number | null;
};

function sortByName<T extends { name: string }>(rows: T[]) {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

function mapRole(role: ApiUser["role"]): UsuarioUI["perfil"] {
  switch (role) {
    case "ADMIN":
      return "Admin";
    case "COLLABORATOR":
      return "Colaborador";
    case "PJ":
      return "PJ";
    case "CLIENT":
      return "Cliente";
    default:
      return "Cliente";
  }
}

function mapStatus(status: ApiUser["status"]): UsuarioUI["status"] {
  return status === "ACTIVE" ? "Ativo" : "Inativo";
}

export default function AdminUsuariosPage() {
  const [modalNovoUsuario, setModalNovoUsuario] = useState(false);
  const [modalPermissoes, setModalPermissoes] = useState(false);
  const [modalEditarUsuario, setModalEditarUsuario] = useState(false);
  const [modalDesativarUsuario, setModalDesativarUsuario] = useState(false);

  const [usuarioSelecionado, setUsuarioSelecionado] = useState("Usuário");
  const [permissoesUserId, setPermissoesUserId] = useState<string | null>(null);
  const [permissoesUserRole, setPermissoesUserRole] = useState<
    ApiUser["role"] | undefined
  >(undefined);
  const [usuarioDesativar, setUsuarioDesativar] = useState<{
    id: string;
    nome: string;
  } | null>(null);

  const [busca, setBusca] = useState("");
  const [usuarios, setUsuarios] = useState<ApiUser[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaApi[]>([]);
  const [serviceDesks, setServiceDesks] = useState<ServiceDeskOption[]>([]);

  const [carregando, setCarregando] = useState(true);
  const [carregandoEmpresas, setCarregandoEmpresas] = useState(false);
  const [carregandoMesas, setCarregandoMesas] = useState(false);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [desativandoUsuario, setDesativandoUsuario] = useState(false);

  const [erro, setErro] = useState("");
  const [erroEdicao, setErroEdicao] = useState("");
  const [erroDesativacao, setErroDesativacao] = useState("");

  const [formEdicao, setFormEdicao] = useState<FormEdicao>({
    id: "",
    name: "",
    email: "",
    role: "CLIENT",
    status: "ACTIVE",
    companyId: "",
    firstAccess: false,
    responsible: false,
    serviceDeskIds: [],
  });
  const [senhaProvisoriaEdicao, setSenhaProvisoriaEdicao] = useState("");
  const [firstAccessInicialEdicao, setFirstAccessInicialEdicao] = useState(false);

  async function buscarUsuarios() {
    try {
      setCarregando(true);
      setErro("");

      const response = await authFetch(`${API_URL}/users`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = (await response.json()) as ApiUser[] | { message?: string };

      if (!response.ok) {
        const message =
          !Array.isArray(data) && typeof data.message === "string"
            ? data.message
            : "Não foi possível carregar os usuários.";

        setErro(message);
        setUsuarios([]);
        return;
      }

      setUsuarios(
        Array.isArray(data) ? [...data].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")) : [],
      );
    } catch {
      setErro("Erro ao conectar com o backend.");
      setUsuarios([]);
    } finally {
      setCarregando(false);
    }
  }

  async function buscarEmpresas() {
    try {
      setCarregandoEmpresas(true);
      setErroEdicao("");

      const response = await authFetch(`${API_URL}/companies`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = (await response.json()) as
        | EmpresaApi[]
        | { message?: string };

      if (!response.ok) {
        const message =
          !Array.isArray(data) && typeof data.message === "string"
            ? data.message
            : "Não foi possível carregar as empresas.";

        setErroEdicao(message);
        setEmpresas([]);
        return;
      }

      setEmpresas(Array.isArray(data) ? sortByName(data) : []);
    } catch {
      setErroEdicao("Erro ao conectar com o backend.");
      setEmpresas([]);
    } finally {
      setCarregandoEmpresas(false);
    }
  }

  async function buscarMesasDeServico() {
    try {
      setCarregandoMesas(true);
      setErroEdicao("");

      const response = await authFetch(`${API_URL}/users/service-desks`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      const data = (await response.json()) as
        | ServiceDeskOption[]
        | { message?: string };

      if (!response.ok) {
        const message =
          !Array.isArray(data) && typeof data.message === "string"
            ? data.message
            : "Não foi possível carregar as mesas de serviço.";
        setErroEdicao(message);
        setServiceDesks([]);
        return;
      }

      setServiceDesks(Array.isArray(data) ? sortByName(data) : []);
    } catch {
      setErroEdicao("Erro ao conectar com o backend.");
      setServiceDesks([]);
    } finally {
      setCarregandoMesas(false);
    }
  }

  useEffect(() => {
    void buscarUsuarios();
    void buscarMesasDeServico();
  }, []);

  const usuariosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    const base = !termo
      ? usuarios
      : usuarios.filter((usuario) => {
      const empresa = usuario.company?.name ?? "Sem empresa";
      return (
        usuario.name.toLowerCase().includes(termo) ||
        usuario.email.toLowerCase().includes(termo) ||
        usuario.role.toLowerCase().includes(termo) ||
        empresa.toLowerCase().includes(termo)
      );
    });
    return [...base].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [busca, usuarios]);

  const usuariosPorEmpresa = useMemo<GrupoEmpresa[]>(() => {
    const grupos = new Map<string, UsuarioUI[]>();

    usuariosFiltrados.forEach((usuario) => {
      const nomeEmpresa = usuario.company?.name ?? "Sem empresa";

      if (!grupos.has(nomeEmpresa)) {
        grupos.set(nomeEmpresa, []);
      }

      grupos.get(nomeEmpresa)?.push({
        id: usuario.id,
        nome: usuario.name,
        email: usuario.email,
        perfil: mapRole(usuario.role),
        status: mapStatus(usuario.status),
      });
    });

    return Array.from(grupos.entries())
      .map(([empresa, usuariosEmpresa]) => ({
        empresa,
        usuarios: [...usuariosEmpresa].sort((a, b) =>
          a.nome.localeCompare(b.nome, "pt-BR"),
        ),
      }))
      .sort((a, b) => a.empresa.localeCompare(b.empresa, "pt-BR"));
  }, [usuariosFiltrados]);

  const totalUsuarios = usuariosFiltrados.length;

  const totalAdmins = usuariosFiltrados.filter(
    (usuario) => usuario.role === "ADMIN"
  ).length;

  const totalColaboradores = usuariosFiltrados.filter(
    (usuario) => usuario.role === "COLLABORATOR" && usuario.status === "ACTIVE"
  ).length;

  const totalClientes = usuariosFiltrados.filter(
    (usuario) => usuario.role === "CLIENT"
  ).length;

  async function abrirEdicao(id: string) {
    const usuario = usuarios.find((item) => item.id === id);

    if (!usuario) {
      return;
    }

    if (empresas.length === 0) {
      await buscarEmpresas();
    }
    if (serviceDesks.length === 0) {
      await buscarMesasDeServico();
    }

    setErroEdicao("");
    setFormEdicao({
      id: usuario.id,
      name: usuario.name,
      email: usuario.email,
      role: usuario.role,
      status: usuario.status,
      companyId: usuario.companyId ?? "",
      firstAccess: usuario.firstAccess,
      responsible: usuario.responsible,
      serviceDeskIds: usuario.serviceDesks.map((desk) => desk.id),
    });
    setSenhaProvisoriaEdicao("");
    setFirstAccessInicialEdicao(usuario.firstAccess);

    setModalEditarUsuario(true);
  }

  function abrirDesativacao(id: string) {
    const usuario = usuarios.find((item) => item.id === id);

    if (!usuario) {
      return;
    }

    setErroDesativacao("");
    setUsuarioDesativar({
      id: usuario.id,
      nome: usuario.name,
    });
    setModalDesativarUsuario(true);
  }

  async function salvarEdicao() {
    if (!formEdicao.id) {
      return;
    }

    if (!formEdicao.name.trim() || !formEdicao.email.trim()) {
      setErroEdicao("Preencha nome e email.");
      return;
    }

    const habilitandoPrimeiroAcesso =
      formEdicao.firstAccess && !firstAccessInicialEdicao;

    if (habilitandoPrimeiroAcesso && !senhaProvisoriaEdicao.trim()) {
      setErroEdicao(
        "Defina a senha provisória para o usuário concluir o primeiro acesso.",
      );
      return;
    }

    if (
      formEdicao.firstAccess &&
      senhaProvisoriaEdicao.trim() &&
      senhaProvisoriaEdicao.trim().length < 6
    ) {
      setErroEdicao("A senha provisória deve ter pelo menos 6 caracteres.");
      return;
    }

    try {
      setSalvandoEdicao(true);
      setErroEdicao("");

      const payload: Record<string, unknown> = {
        name: formEdicao.name,
        email: formEdicao.email,
        role: formEdicao.role,
        status: formEdicao.status,
        companyId: formEdicao.companyId || null,
        firstAccess: formEdicao.firstAccess,
        responsible: formEdicao.responsible,
        serviceDeskIds: formEdicao.serviceDeskIds,
      };

      if (senhaProvisoriaEdicao.trim()) {
        payload.password = senhaProvisoriaEdicao.trim();
      }

      const response = await authFetch(`${API_URL}/users/${formEdicao.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as
        | Record<string, unknown>
        | { message?: string };

      if (!response.ok) {
        const message =
          typeof data === "object" &&
          data !== null &&
          "message" in data &&
          typeof data.message === "string"
            ? data.message
            : "Não foi possível salvar as alterações.";

        setErroEdicao(message);
        return;
      }

      setModalEditarUsuario(false);
      await buscarUsuarios();
    } catch {
      setErroEdicao("Erro ao conectar com o backend.");
    } finally {
      setSalvandoEdicao(false);
    }
  }

  async function confirmarDesativacaoUsuario() {
    if (!usuarioDesativar?.id) {
      return;
    }

    try {
      setDesativandoUsuario(true);
      setErroDesativacao("");

      const response = await authFetch(`${API_URL}/users/${usuarioDesativar.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: "INACTIVE",
        }),
      });

      const data = (await response.json()) as
        | Record<string, unknown>
        | { message?: string };

      if (!response.ok) {
        const message =
          typeof data === "object" &&
          data !== null &&
          "message" in data &&
          typeof data.message === "string"
            ? data.message
            : "Erro ao desativar usuário.";

        setErroDesativacao(message);
        return;
      }

      setModalDesativarUsuario(false);
      setUsuarioDesativar(null);
      await buscarUsuarios();
    } catch {
      setErroDesativacao("Erro ao conectar com o backend.");
    } finally {
      setDesativandoUsuario(false);
    }
  }

  return (
    <ProtectedPage>
      <PermissionGate module="USERS">
      <AppShell>
        <div className="font-sans w-full space-y-8">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold text-foreground">Usuários</h1>
              <p className="text-muted-foreground">
                Gerencie usuários, vínculos por empresa e permissões de acesso.
              </p>
            </div>

            <Button
              onClick={() => setModalNovoUsuario(true)}
              className="h-11 gap-2"
            >
              <Plus size={18} />
              Novo usuário
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-4">
            <Card>
              <CardContent className="flex min-h-[132px] items-center justify-between p-6">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-muted-foreground">
                    Total de usuários
                  </p>
                  <p className="text-3xl font-bold">{totalUsuarios}</p>
                </div>

                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Users size={28} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex min-h-[132px] items-center justify-between p-6">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-muted-foreground">
                    Empresas com acesso
                  </p>
                  <p className="text-3xl font-bold">
                    {usuariosPorEmpresa.length}
                  </p>
                </div>

                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/12 text-orange-400">
                  <Building2 size={28} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex min-h-[132px] items-center justify-between p-6">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-muted-foreground">
                    Perfis administrativos
                  </p>
                  <p className="text-3xl font-bold">{totalAdmins}</p>
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
                    Colaboradores ativos
                  </p>
                  <p className="text-3xl font-bold">{totalColaboradores}</p>
                </div>

                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/12 text-violet-400">
                  <UserCog size={28} />
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
                      Gestão de usuários
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Usuários organizados por empresa com foco em permissões.
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
                      placeholder="Buscar usuário..."
                      className="h-11 pl-10"
                    />
                  </div>
                </div>

                {carregando ? (
                  <div className="rounded-2xl border border-border bg-muted/40 p-6 text-sm text-muted-foreground">
                    Carregando usuários...
                  </div>
                ) : erro ? (
                  <div className="alle-alert-error rounded-2xl p-6 text-sm">
                    {erro}
                  </div>
                ) : usuariosPorEmpresa.length === 0 ? (
                  <div className="rounded-2xl border border-border bg-muted/40 p-6 text-sm text-muted-foreground">
                    Nenhum usuário encontrado.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {usuariosPorEmpresa.map((grupo) => (
                      <details
                        key={grupo.empresa}
                        open
                        className="overflow-hidden rounded-2xl border border-border bg-muted/40"
                      >
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 transition hover:bg-muted/30">
                          <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                              <Building2 size={20} />
                            </div>

                            <div className="space-y-1">
                              <p className="font-semibold text-foreground">
                                {grupo.empresa}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {grupo.usuarios.length} usuário(s)
                              </p>
                            </div>
                          </div>

                          <ChevronDown
                            size={18}
                            className="shrink-0 text-muted-foreground"
                          />
                        </summary>

                        <div className="border-t border-border">
                          {grupo.usuarios.map((usuario, index) => (
                            <div
                              key={usuario.id}
                              className={`flex flex-col gap-4 px-5 py-4 xl:flex-row xl:items-center xl:justify-between ${
                                index !== 0 ? "border-t border-border" : ""
                              }`}
                            >
                              <div className="space-y-1">
                                <p className="font-semibold text-foreground">
                                  {usuario.nome}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {usuario.email}
                                </p>
                                {(() => {
                                  const full = usuarios.find((u) => u.id === usuario.id);
                                  if (!full) return null;
                                  const desks = full.serviceDesks.map((d) => d.name).join(", ");
                                  return (
                                    <p className="text-xs text-muted-foreground">
                                      {desks ? `Mesas: ${desks}` : "Sem mesa vinculada"}
                                      {full.responsible ? " • Responsável" : ""}
                                    </p>
                                  );
                                })()}
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center whitespace-nowrap rounded-full bg-primary/15 px-3 py-1 text-xs font-bold text-primary">
                                  {usuario.perfil}
                                </span>

                                <span
                                  className={`inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ${
                                    usuario.status === "Ativo"
                                      ? "alle-badge-success"
                                      : "alle-badge-danger"
                                  }`}
                                >
                                  {usuario.status}
                                </span>

                                <button
                                  onClick={() => {
                                    setUsuarioSelecionado(usuario.nome);
                                    const full = usuarios.find(
                                      (u) => u.id === usuario.id,
                                    );
                                    setPermissoesUserId(usuario.id);
                                    setPermissoesUserRole(full?.role);
                                    setModalPermissoes(true);
                                  }}
                                  className="inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-xl border border-border bg-background/40 px-3 text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
                                >
                                  <ShieldCheck size={15} />
                                  <span className="text-xs font-semibold">
                                    Permissões
                                  </span>
                                </button>

                                <button
                                  onClick={() => void abrirEdicao(usuario.id)}
                                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background/40 text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
                                  title="Editar usuário"
                                >
                                  <Pencil size={16} />
                                </button>

                                <button
                                  onClick={() => abrirDesativacao(usuario.id)}
                                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background/40 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                                  title="Desativar usuário"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </details>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex h-full flex-col justify-between p-6">
                <div className="space-y-5">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Users size={28} />
                  </div>

                  <div className="space-y-2">
                    <h2 className="text-2xl font-bold tracking-tight text-foreground">
                      Controle de acessos
                    </h2>

                    <p className="text-sm leading-6 text-muted-foreground">
                      Organize usuários por empresa e mantenha permissões
                      centralizadas para cada perfil do portal.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-border bg-muted/40 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Clientes
                      </p>
                      <p className="mt-2 text-xl font-bold text-foreground">
                        {totalClientes}
                      </p>
                    </div>

                    <div className="rounded-xl border border-border bg-muted/40 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Colaboradores
                      </p>
                      <p className="mt-2 text-xl font-bold text-foreground">
                        {totalColaboradores}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 rounded-xl border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                  Área preparada para edição de perfil, vínculos por empresa e
                  permissões detalhadas por módulo.
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <ModalNovoUsuario
          open={modalNovoUsuario}
          onOpenChange={(open) => {
            setModalNovoUsuario(open);

            if (!open) {
              void buscarUsuarios();
            }
          }}
        />

        <ModalPermissoesUsuario
          open={modalPermissoes}
          onOpenChange={(open) => {
            setModalPermissoes(open);
            if (!open) {
              setPermissoesUserId(null);
              setPermissoesUserRole(undefined);
            }
          }}
          usuarioNome={usuarioSelecionado}
          userId={permissoesUserId}
          userRole={permissoesUserRole}
          onSaved={() => void buscarUsuarios()}
        />

        <Dialog
          open={modalEditarUsuario}
          onOpenChange={(open) => {
            setModalEditarUsuario(open);
            if (!open) {
              setSenhaProvisoriaEdicao("");
            }
          }}
        >
          <DialogContent
            className="
              font-sans
              flex max-h-[92vh] !w-[95vw] !max-w-[980px] sm:!w-[min(980px,95vw)] sm:!max-w-[980px] flex-col overflow-hidden
              border border-border bg-card p-0 text-card-foreground
            "
          >
            <div className="shrink-0 border-b border-border px-6 py-6">
              <DialogHeader className="space-y-3 text-left">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Pencil size={22} />
                </div>

                <div className="space-y-1">
                  <DialogTitle className="text-2xl font-bold text-foreground">
                    Editar usuário
                  </DialogTitle>
                  <DialogDescription className="text-sm text-muted-foreground">
                    Atualize os dados, vínculo e status do usuário selecionado.
                  </DialogDescription>
                </div>
              </DialogHeader>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-sm font-semibold text-foreground">
                    Nome completo
                  </Label>
                  <Input
                    value={formEdicao.name}
                    onChange={(e) =>
                      setFormEdicao((prev) => ({
                        ...prev,
                        name: e.target.value,
                      }))
                    }
                    className="h-11"
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-sm font-semibold text-foreground">
                    Email
                  </Label>
                  <Input
                    value={formEdicao.email}
                    onChange={(e) =>
                      setFormEdicao((prev) => ({
                        ...prev,
                        email: e.target.value,
                      }))
                    }
                    className="h-11"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-foreground">
                    Empresa
                  </Label>
                  <SearchableSelectField
                    value={formEdicao.companyId}
                    onChange={(value) =>
                      setFormEdicao((prev) => ({
                        ...prev,
                        companyId: value,
                      }))
                    }
                    disabled={carregandoEmpresas}
                    options={empresas.map((empresa) => ({
                      value: empresa.id,
                      label: empresa.name,
                    }))}
                    emptyLabel="Sem empresa"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-foreground">
                    Perfil
                  </Label>
                  <SearchableSelectField
                    value={formEdicao.role}
                    onChange={(value) =>
                      setFormEdicao((prev) => ({
                        ...prev,
                        role: value as FormEdicao["role"],
                      }))
                    }
                    options={[
                      { value: "ADMIN", label: "Administrador" },
                      { value: "CLIENT", label: "Cliente" },
                      { value: "COLLABORATOR", label: "Colaborador" },
                      { value: "PJ", label: "PJ" },
                    ]}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-foreground">
                    Status
                  </Label>
                  <SearchableSelectField
                    value={formEdicao.status}
                    onChange={(value) =>
                      setFormEdicao((prev) => ({
                        ...prev,
                        status: value as FormEdicao["status"],
                      }))
                    }
                    options={[
                      { value: "ACTIVE", label: "Ativo" },
                      { value: "INACTIVE", label: "Inativo" },
                    ]}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-foreground">
                    Primeiro acesso
                  </Label>
                  <SearchableSelectField
                    value={formEdicao.firstAccess ? "true" : "false"}
                    onChange={(value) =>
                      setFormEdicao((prev) => ({
                        ...prev,
                        firstAccess: value === "true",
                      }))
                    }
                    options={[
                      { value: "false", label: "Não" },
                      { value: "true", label: "Sim" },
                    ]}
                  />
                  <p className="text-xs text-muted-foreground">
                    Com &quot;Sim&quot;, o usuário entra com a senha provisória e
                    é direcionado a definir a senha definitiva no primeiro acesso.
                  </p>
                </div>

                {formEdicao.firstAccess ? (
                  <div className="space-y-2 sm:col-span-2">
                    <Label className="text-sm font-semibold text-foreground">
                      Senha provisória
                      {formEdicao.firstAccess && !firstAccessInicialEdicao ? (
                        <span className="text-destructive"> *</span>
                      ) : null}
                    </Label>
                    <Input
                      type="password"
                      value={senhaProvisoriaEdicao}
                      onChange={(e) => setSenhaProvisoriaEdicao(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      autoComplete="new-password"
                      className="h-11"
                    />
                    <p className="text-xs text-muted-foreground">
                      {firstAccessInicialEdicao
                        ? "Deixe em branco para manter a senha atual. Preencha apenas se quiser gerar uma nova senha provisória."
                        : "Obrigatória ao ativar primeiro acesso. O usuário usará esta senha no login e depois criará a senha definitiva."}
                    </p>
                  </div>
                ) : null}

                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-sm font-semibold text-foreground">
                    Mesas de serviço
                  </Label>
                  <div className="max-h-40 overflow-y-auto rounded-xl border border-input bg-background p-3">
                    {carregandoMesas ? (
                      <p className="text-sm text-muted-foreground">Carregando mesas...</p>
                    ) : serviceDesks.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Nenhuma mesa disponível.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {serviceDesks.map((desk) => (
                          <label
                            key={desk.id}
                            className="flex items-center gap-2 text-sm text-foreground"
                          >
                            <FlipCheckbox
                              checked={formEdicao.serviceDeskIds.includes(desk.id)}
                              onChange={(e) =>
                                setFormEdicao((prev) => ({
                                  ...prev,
                                  serviceDeskIds: e.target.checked
                                    ? [...prev.serviceDeskIds, desk.id]
                                    : prev.serviceDeskIds.filter(
                                        (id) => id !== desk.id,
                                      ),
                                }))
                              }
                            />
                            <span>{desk.name}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-sm font-semibold text-foreground">
                    Responsável
                  </Label>
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <FlipCheckbox
                      checked={formEdicao.responsible}
                      onChange={(e) =>
                        setFormEdicao((prev) => ({
                          ...prev,
                          responsible: e.target.checked,
                        }))
                      }
                    />
                    Marcar usuário como responsável
                  </label>
                </div>
              </div>

              {erroEdicao ? (
                <div className="alle-alert-error mt-5 rounded-xl px-3 py-2 text-sm">
                  {erroEdicao}
                </div>
              ) : null}
            </div>

            <div className="shrink-0 border-t border-border bg-card px-6 py-4">
              <div className="flex w-full flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setModalEditarUsuario(false)}
                  className="h-11"
                >
                  Cancelar
                </Button>

                <Button
                  type="button"
                  onClick={() => void salvarEdicao()}
                  disabled={salvandoEdicao}
                  className="h-11"
                >
                  {salvandoEdicao ? "Salvando..." : "Salvar alterações"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={modalDesativarUsuario}
          onOpenChange={setModalDesativarUsuario}
        >
          <DialogContent
            className="
              font-sans
              flex max-h-[90vh] w-[95vw] max-w-[520px] flex-col overflow-hidden
              border border-border bg-card p-0 text-card-foreground
            "
          >
            <div className="shrink-0 border-b border-border px-6 py-6">
              <DialogHeader className="space-y-3 text-left">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/15 text-destructive">
                  <TriangleAlert size={22} />
                </div>

                <div className="space-y-1">
                  <DialogTitle className="text-2xl font-bold text-foreground">
                    Desativar usuário
                  </DialogTitle>
                  <DialogDescription className="text-sm text-muted-foreground">
                    Essa ação irá inativar o usuário no sistema, sem excluir os
                    dados do cadastro.
                  </DialogDescription>
                </div>
              </DialogHeader>
            </div>

            <div className="px-6 py-6">
              <div className="rounded-2xl border border-border bg-muted/40 p-4">
                <p className="text-sm text-muted-foreground">Usuário selecionado</p>
                <p className="mt-1 text-base font-bold text-foreground">
                  {usuarioDesativar?.nome ?? "Usuário"}
                </p>
              </div>

              {erroDesativacao ? (
                <div className="alle-alert-error mt-5 rounded-xl px-3 py-2 text-sm">
                  {erroDesativacao}
                </div>
              ) : null}
            </div>

            <div className="shrink-0 border-t border-border bg-card px-6 py-4">
              <div className="flex w-full flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setModalDesativarUsuario(false)}
                  className="h-11"
                >
                  Cancelar
                </Button>

                <Button
                  type="button"
                  onClick={() => void confirmarDesativacaoUsuario()}
                  disabled={desativandoUsuario}
                  className="h-11"
                  variant="destructive"
                >
                  {desativandoUsuario ? "Desativando..." : "Desativar usuário"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </AppShell>
      </PermissionGate>
    </ProtectedPage>
  );
}