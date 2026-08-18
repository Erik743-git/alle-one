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
import { sortByName } from "@/lib/collections";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import { authFetch } from "@/lib/auth-fetch";
import { getApiErrorPayload } from "@/lib/api";
import { useConfirm } from "@/lib/confirm";
import { API_URL } from "@/lib/env";
import { usersService } from "@/lib/services/users.service";
import { UserRendimentoScheduleFields } from "@/components/admin/user-rendimento-schedule-fields";
import {
  formatUserRendimentoScheduleSummary,
  normalizeUserRendimentoSchedule,
  usesRendimentoScheduleRole,
  type UserRendimentoScheduleValue,
} from "@/lib/user-rendimento-schedule";

type ApiUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "COLLABORATOR" | "PJ" | "CLIENT" | "CLIENT_GESTOR" | "CLIENT_MEMBER";
  status: "ACTIVE" | "INACTIVE";
  firstAccess: boolean;
  responsible: boolean;
  companyId: string | null;
  isOnline?: boolean;
  specialtyId?: string | null;
  specialty?: {
    id: string;
    name: string;
    externalId: number | null;
  } | null;
  specialties?: Array<{
    id: string;
    name: string;
    externalId: number | null;
  }>;
  serviceDesks?: Array<{
    id: string;
    name: string;
    externalId: number | null;
  }>;
  company?: {
    id: string;
    name: string;
  } | null;
  companyMemberships?: Array<{
    companyId: string;
    companyName: string;
    clientRole: "CLIENT_GESTOR" | "CLIENT_MEMBER";
  }>;
  rendimentoCustomSchedule?: boolean;
  rendimentoDailyWorkMinutes?: number | null;
  rendimentoLunchMinutes?: number | null;
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
  perfil: "Admin" | "Colaborador" | "Terceiro" | "Cliente" | "Cliente gestor" | "Cliente funcionário";
  status: "Ativo" | "Inativo";
  online: boolean;
};

type GrupoEmpresa = {
  empresa: string;
  usuarios: UsuarioUI[];
};

type FormEdicao = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "COLLABORATOR" | "PJ" | "CLIENT" | "CLIENT_GESTOR" | "CLIENT_MEMBER";
  status: "ACTIVE" | "INACTIVE";
  companyId: string;
  firstAccess: boolean;
  responsible: boolean;
  specialtyId: string;
  rendimentoSchedule: UserRendimentoScheduleValue;
};

type SpecialtyOption = {
  id: string;
  name: string;
  externalId: number | null;
};

function resolveUserSpecialtyId(usuario: ApiUser): string {
  return (
    usuario.specialtyId ??
    usuario.specialty?.id ??
    usuario.specialties?.[0]?.id ??
    usuario.serviceDesks?.[0]?.id ??
    ""
  );
}

function resolveUserSpecialtyName(usuario: ApiUser): string | null {
  return (
    usuario.specialty?.name ??
    usuario.specialties?.[0]?.name ??
    usuario.serviceDesks?.[0]?.name ??
    null
  );
}

function mapRole(role: ApiUser["role"]): UsuarioUI["perfil"] {
  switch (role) {
    case "ADMIN":
      return "Admin";
    case "COLLABORATOR":
      return "Colaborador";
    case "PJ":
      return "Terceiro";
    case "CLIENT":
    case "CLIENT_GESTOR":
      return "Cliente gestor";
    case "CLIENT_MEMBER":
      return "Cliente funcionário";
    default:
      return "Cliente";
  }
}

function mapStatus(status: ApiUser["status"]): UsuarioUI["status"] {
  return status === "ACTIVE" ? "Ativo" : "Inativo";
}

export default function AdminUsuariosPage() {
  const confirm = useConfirm();
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
  const [specialties, setSpecialties] = useState<SpecialtyOption[]>([]);

  const [carregando, setCarregando] = useState(true);
  const [carregandoEmpresas, setCarregandoEmpresas] = useState(false);
  const [carregandoEspecialidades, setCarregandoEspecialidades] = useState(false);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [desativandoUsuario, setDesativandoUsuario] = useState(false);

  const [erro, setErro] = useState("");
  const [erroEdicao, setErroEdicao] = useState("");
  const [erroDesativacao, setErroDesativacao] = useState("");

  const [formEdicao, setFormEdicao] = useState<FormEdicao>({
    id: "",
    name: "",
    email: "",
    role: "CLIENT_GESTOR",
    status: "ACTIVE",
    companyId: "",
    firstAccess: false,
    responsible: false,
    specialtyId: "",
    rendimentoSchedule: normalizeUserRendimentoSchedule({}),
  });
  const [senhaProvisoriaEdicao, setSenhaProvisoriaEdicao] = useState("");
  const [firstAccessInicialEdicao, setFirstAccessInicialEdicao] = useState(false);

  async function buscarUsuarios() {
    try {
      setCarregando(true);
      setErro("");

      const data = await usersService.list();
      setUsuarios(
        [...data].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
      );
    } catch (err) {
      setErro(
        err instanceof Error ? err.message : "Erro ao conectar com o backend.",
      );
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

  async function buscarEspecialidades() {
    try {
      setCarregandoEspecialidades(true);
      setErroEdicao("");

      const data = await usersService.listSpecialties();
      setSpecialties(sortByName(data));
    } catch {
      setErroEdicao("Erro ao conectar com o backend.");
      setSpecialties([]);
    } finally {
      setCarregandoEspecialidades(false);
    }
  }

  useEffect(() => {
    void buscarUsuarios();
    void buscarEspecialidades();
  }, []);

  const usuariosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    const base = !termo
      ? usuarios
      : usuarios.filter((usuario) => {
          const empresasNomes = [
            usuario.company?.name ?? "",
            ...(usuario.companyMemberships ?? []).map((m) => m.companyName),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return (
            usuario.name.toLowerCase().includes(termo) ||
            usuario.email.toLowerCase().includes(termo) ||
            usuario.role.toLowerCase().includes(termo) ||
            empresasNomes.includes(termo)
          );
        });
    return [...base].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [busca, usuarios]);

  const usuariosPorEmpresa = useMemo<GrupoEmpresa[]>(() => {
    const grupos = new Map<string, UsuarioUI[]>();

    const pushInGroup = (
      nomeEmpresa: string,
      usuario: ApiUser,
      perfilRole: ApiUser["role"] | "CLIENT_GESTOR" | "CLIENT_MEMBER",
    ) => {
      if (!grupos.has(nomeEmpresa)) {
        grupos.set(nomeEmpresa, []);
      }
      const list = grupos.get(nomeEmpresa)!;
      if (list.some((u) => u.id === usuario.id)) return;
      list.push({
        id: usuario.id,
        nome: usuario.name,
        email: usuario.email,
        perfil: mapRole(perfilRole),
        status: mapStatus(usuario.status),
        online: Boolean(usuario.isOnline),
      });
    };

    usuariosFiltrados.forEach((usuario) => {
      const memberships = usuario.companyMemberships ?? [];
      if (usuario.company?.name) {
        pushInGroup(usuario.company.name, usuario, usuario.role);
      }
      for (const m of memberships) {
        const name = m.companyName?.trim();
        if (!name) continue;
        // Na empresa ativa, o papel global do usuário prevalece.
        if (m.companyId === usuario.companyId) continue;
        pushInGroup(name, usuario, m.clientRole);
      }
      if (!usuario.company?.name && memberships.length === 0) {
        pushInGroup("Sem empresa", usuario, usuario.role);
      }
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
    (usuario) => usuario.role === "CLIENT" || usuario.role === "CLIENT_GESTOR" || usuario.role === "CLIENT_MEMBER"
  ).length;

  async function abrirEdicao(id: string) {
    const usuario = usuarios.find((item) => item.id === id);

    if (!usuario) {
      return;
    }

    if (empresas.length === 0) {
      await buscarEmpresas();
    }
    if (specialties.length === 0) {
      await buscarEspecialidades();
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
      specialtyId: resolveUserSpecialtyId(usuario),
      rendimentoSchedule: normalizeUserRendimentoSchedule(usuario),
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

  async function offerLinkExistingUser(payload: Record<string, unknown>) {
    const userId = typeof payload.userId === "string" ? payload.userId : null;
    const userName =
      typeof payload.userName === "string" ? payload.userName : "este usuário";
    const canLink = payload.canLinkCompany === true;
    const companyIds = Array.isArray(payload.companyIds)
      ? payload.companyIds.filter((id): id is string => typeof id === "string")
      : [];
    const companyNames = Array.isArray(payload.companyNames)
      ? payload.companyNames.filter(
          (name): name is string => typeof name === "string",
        )
      : [];

    const targetCompanyId = formEdicao.companyId;
    const targetCompany = empresas.find((c) => c.id === targetCompanyId);
    const targetName = targetCompany?.name ?? "a empresa selecionada";

    if (!targetCompanyId) {
      setErroEdicao(
        "Já existe um usuário com este e-mail. Selecione uma empresa para conceder acesso.",
      );
      return;
    }

    if (!canLink || !userId) {
      setErroEdicao(
        "Já existe um usuário com este e-mail, mas ele não é um usuário cliente e não pode receber acesso multi-empresa.",
      );
      return;
    }

    if (companyIds.includes(targetCompanyId)) {
      setErroEdicao(
        `O usuário ${userName} já possui acesso à empresa ${targetName}.`,
      );
      return;
    }

    const formatCompanyList = (names: string[]) => {
      if (names.length === 0) return "";
      if (names.length === 1) return names[0];
      if (names.length === 2) return `${names[0]} e ${names[1]}`;
      return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
    };

    const existingLabel = formatCompanyList(companyNames);
    const description = existingLabel
      ? `Já existe um usuário cadastrado com este e-mail (${userName}), com acesso a ${existingLabel}. Deseja que esse usuário também tenha acesso à empresa ${targetName}?`
      : `Já existe um usuário cadastrado com este e-mail (${userName}). Deseja que esse usuário tenha acesso à empresa ${targetName}?`;

    const ok = await confirm({
      title: "Usuário já cadastrado",
      description,
      confirmText: "Sim, conceder acesso",
      cancelText: "Não",
      variant: "warning",
    });

    if (!ok) return;

    const clientRole =
      formEdicao.role === "CLIENT_GESTOR" ||
      formEdicao.role === "CLIENT_MEMBER"
        ? formEdicao.role
        : "CLIENT_MEMBER";

    await usersService.upsertCompanyMembership(userId, {
      companyId: targetCompanyId,
      clientRole,
    });

    setModalEditarUsuario(false);
    await buscarUsuarios();
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
      senhaProvisoriaEdicao.trim().length < 8
    ) {
      setErroEdicao(
        "A senha provisória deve ter pelo menos 8 caracteres, com maiúscula, minúscula, número e caractere especial.",
      );
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
        specialtyId: formEdicao.specialtyId || null,
      };

      if (usesRendimentoScheduleRole(formEdicao.role)) {
        payload.rendimentoCustomSchedule =
          formEdicao.rendimentoSchedule.rendimentoCustomSchedule;
        payload.rendimentoDailyWorkMinutes = formEdicao.rendimentoSchedule
          .rendimentoCustomSchedule
          ? formEdicao.rendimentoSchedule.rendimentoDailyWorkMinutes
          : null;
        payload.rendimentoLunchMinutes = formEdicao.rendimentoSchedule
          .rendimentoCustomSchedule
          ? formEdicao.rendimentoSchedule.rendimentoLunchMinutes
          : null;
      }

      if (senhaProvisoriaEdicao.trim()) {
        payload.password = senhaProvisoriaEdicao.trim();
      }

      await usersService.update(formEdicao.id, payload);
      setModalEditarUsuario(false);
      await buscarUsuarios();
    } catch (err) {
      const payload = getApiErrorPayload(err);
      if (payload?.code === "EMAIL_EXISTS") {
        try {
          await offerLinkExistingUser(payload);
        } catch (linkErr) {
          setErroEdicao(
            linkErr instanceof Error
              ? linkErr.message
              : "Erro ao conceder acesso à empresa.",
          );
        }
        return;
      }

      setErroEdicao(
        err instanceof Error
          ? err.message
          : "Erro ao conectar com o backend.",
      );
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
      await usersService.update(usuarioDesativar.id, { status: "INACTIVE" });
      setModalDesativarUsuario(false);
      setUsuarioDesativar(null);
      await buscarUsuarios();
    } catch (err) {
      setErroDesativacao(
        err instanceof Error
          ? err.message
          : "Não foi possível desativar o usuário.",
      );
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
                              key={`${grupo.empresa}-${usuario.id}`}
                              className={`flex flex-col gap-4 px-5 py-4 xl:flex-row xl:items-center xl:justify-between ${
                                index !== 0 ? "border-t border-border" : ""
                              }`}
                            >
                              <div className="space-y-1">
                                <p className="flex items-center gap-2 font-semibold text-foreground">
                                  <span
                                    className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${
                                      usuario.online
                                        ? "bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.25)]"
                                        : "bg-muted-foreground/35"
                                    }`}
                                    title={
                                      usuario.online
                                        ? "Online no portal (últimos 10 min)"
                                        : "Offline"
                                    }
                                    aria-hidden
                                  />
                                  {usuario.nome}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {usuario.email}
                                </p>
                                {(() => {
                                  const full = usuarios.find((u) => u.id === usuario.id);
                                  if (!full) return null;
                                  const specialtyName = resolveUserSpecialtyName(full);
                                  return (
                                    <>
                                      <p className="text-xs text-muted-foreground">
                                        {specialtyName
                                          ? `Especialidade: ${specialtyName}`
                                          : "Sem especialidade"}
                                        {full.responsible ? " • Responsável" : ""}
                                      </p>
                                      {usesRendimentoScheduleRole(full.role) ? (
                                        <p className="text-xs text-muted-foreground">
                                          Jornada:{" "}
                                          {formatUserRendimentoScheduleSummary(
                                            normalizeUserRendimentoSchedule(full),
                                          )}
                                        </p>
                                      ) : null}
                                    </>
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
                      { value: "CLIENT_GESTOR", label: "Cliente (gestor)" },
                      { value: "CLIENT_MEMBER", label: "Cliente (funcionário)" },
                      { value: "COLLABORATOR", label: "Colaborador" },
                      { value: "PJ", label: "Terceiro" },
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
                    Redefinir senha / primeiro acesso
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
                      placeholder="Mín. 8 caracteres (A a, 0-9, especial)"
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
                    Especialidade
                  </Label>
                  <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-border bg-muted/20 p-2">
                    {carregandoEspecialidades ? (
                      <p className="px-2 py-3 text-sm text-muted-foreground">
                        Carregando especialidades...
                      </p>
                    ) : specialties.length === 0 ? (
                      <p className="px-2 py-3 text-sm text-muted-foreground">
                        Nenhuma especialidade disponível.
                      </p>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            setFormEdicao((prev) => ({ ...prev, specialtyId: "" }))
                          }
                          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                            !formEdicao.specialtyId
                              ? "bg-primary/10 text-foreground ring-1 ring-primary/40"
                              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                          }`}
                        >
                          <span
                            className={`flex size-4 shrink-0 items-center justify-center rounded-full border-2 ${
                              !formEdicao.specialtyId
                                ? "border-primary"
                                : "border-border"
                            }`}
                          >
                            {!formEdicao.specialtyId ? (
                              <span className="size-2 rounded-full bg-primary" />
                            ) : null}
                          </span>
                          Nenhuma
                        </button>
                        {specialties.map((item) => {
                          const selected = formEdicao.specialtyId === item.id;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() =>
                                setFormEdicao((prev) => ({
                                  ...prev,
                                  specialtyId: item.id,
                                }))
                              }
                              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                                selected
                                  ? "bg-primary/10 text-foreground ring-1 ring-primary/40"
                                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                              }`}
                            >
                              <span
                                className={`flex size-4 shrink-0 items-center justify-center rounded-full border-2 ${
                                  selected ? "border-primary" : "border-border"
                                }`}
                              >
                                {selected ? (
                                  <span className="size-2 rounded-full bg-primary" />
                                ) : null}
                              </span>
                              <span className="truncate font-medium">{item.name}</span>
                            </button>
                          );
                        })}
                      </>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Apenas uma especialidade por usuário.
                  </p>
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

                <UserRendimentoScheduleFields
                  role={formEdicao.role}
                  value={formEdicao.rendimentoSchedule}
                  onChange={(rendimentoSchedule) =>
                    setFormEdicao((prev) => ({
                      ...prev,
                      rendimentoSchedule,
                    }))
                  }
                />
              </div>

              {erroEdicao ? (
                <div className="alle-alert-error mt-5 rounded-xl px-3 py-2 text-sm">
                  {erroEdicao}
                </div>
              ) : null}
            </div>

            <div className="shrink-0 border-t border-border bg-card px-6 pt-4 pb-6">
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

            <div className="shrink-0 border-t border-border bg-card px-6 pt-4 pb-6">
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