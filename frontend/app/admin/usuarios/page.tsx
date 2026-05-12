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
  role: "ADMIN" | "COLLABORATOR" | "CLIENT";
  status: "ACTIVE" | "INACTIVE";
  firstAccess: boolean;
  companyId: string | null;
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
  perfil: "Admin" | "Colaborador" | "Cliente";
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
  role: "ADMIN" | "COLLABORATOR" | "CLIENT";
  status: "ACTIVE" | "INACTIVE";
  companyId: string;
  firstAccess: boolean;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

function mapRole(role: ApiUser["role"]): UsuarioUI["perfil"] {
  switch (role) {
    case "ADMIN":
      return "Admin";
    case "COLLABORATOR":
      return "Colaborador";
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

  const [carregando, setCarregando] = useState(true);
  const [carregandoEmpresas, setCarregandoEmpresas] = useState(false);
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
  });

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

      setUsuarios(Array.isArray(data) ? data : []);
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

      setEmpresas(Array.isArray(data) ? data : []);
    } catch {
      setErroEdicao("Erro ao conectar com o backend.");
      setEmpresas([]);
    } finally {
      setCarregandoEmpresas(false);
    }
  }

  useEffect(() => {
    void buscarUsuarios();
  }, []);

  const usuariosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    if (!termo) {
      return usuarios;
    }

    return usuarios.filter((usuario) => {
      const empresa = usuario.company?.name ?? "Sem empresa";
      return (
        usuario.name.toLowerCase().includes(termo) ||
        usuario.email.toLowerCase().includes(termo) ||
        usuario.role.toLowerCase().includes(termo) ||
        empresa.toLowerCase().includes(termo)
      );
    });
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

    return Array.from(grupos.entries()).map(([empresa, usuariosEmpresa]) => ({
      empresa,
      usuarios: usuariosEmpresa,
    }));
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

    setErroEdicao("");
    setFormEdicao({
      id: usuario.id,
      name: usuario.name,
      email: usuario.email,
      role: usuario.role,
      status: usuario.status,
      companyId: usuario.companyId ?? "",
      firstAccess: usuario.firstAccess,
    });

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

    try {
      setSalvandoEdicao(true);
      setErroEdicao("");

      const response = await authFetch(`${API_URL}/users/${formEdicao.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formEdicao.name,
          email: formEdicao.email,
          role: formEdicao.role,
          status: formEdicao.status,
          companyId: formEdicao.companyId || null,
          firstAccess: formEdicao.firstAccess,
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

                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-500/12 text-green-400">
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
                  <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6 text-sm text-red-200">
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
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center whitespace-nowrap rounded-full bg-primary/15 px-3 py-1 text-xs font-bold text-primary">
                                  {usuario.perfil}
                                </span>

                                <span
                                  className={`inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ${
                                    usuario.status === "Ativo"
                                      ? "bg-green-500/15 text-green-400"
                                      : "bg-red-500/15 text-red-400"
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
                                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background/40 text-muted-foreground transition hover:bg-red-500/10 hover:text-red-400"
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

        <Dialog open={modalEditarUsuario} onOpenChange={setModalEditarUsuario}>
          <DialogContent
            className="
              font-sans
              flex max-h-[92vh] w-[95vw] max-w-[680px] flex-col overflow-hidden
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
                  <select
                    value={formEdicao.companyId}
                    onChange={(e) =>
                      setFormEdicao((prev) => ({
                        ...prev,
                        companyId: e.target.value,
                      }))
                    }
                    disabled={carregandoEmpresas}
                    className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none"
                  >
                    <option value="">Sem empresa</option>
                    {empresas.map((empresa) => (
                      <option key={empresa.id} value={empresa.id}>
                        {empresa.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-foreground">
                    Perfil
                  </Label>
                  <select
                    value={formEdicao.role}
                    onChange={(e) =>
                      setFormEdicao((prev) => ({
                        ...prev,
                        role: e.target.value as FormEdicao["role"],
                      }))
                    }
                    className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none"
                  >
                    <option value="ADMIN">Administrador</option>
                    <option value="COLLABORATOR">Colaborador</option>
                    <option value="CLIENT">Cliente</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-foreground">
                    Status
                  </Label>
                  <select
                    value={formEdicao.status}
                    onChange={(e) =>
                      setFormEdicao((prev) => ({
                        ...prev,
                        status: e.target.value as FormEdicao["status"],
                      }))
                    }
                    className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none"
                  >
                    <option value="ACTIVE">Ativo</option>
                    <option value="INACTIVE">Inativo</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-foreground">
                    Primeiro acesso
                  </Label>
                  <select
                    value={formEdicao.firstAccess ? "true" : "false"}
                    onChange={(e) =>
                      setFormEdicao((prev) => ({
                        ...prev,
                        firstAccess: e.target.value === "true",
                      }))
                    }
                    className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none"
                  >
                    <option value="true">Sim</option>
                    <option value="false">Não</option>
                  </select>
                </div>
              </div>

              {erroEdicao ? (
                <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
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
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/12 text-red-400">
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
                <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
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