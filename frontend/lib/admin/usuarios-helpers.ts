import {
  normalizeUserRendimentoSchedule,
  type UserRendimentoScheduleValue,
} from "@/lib/user-rendimento-schedule";

export type ApiUser = {
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

export type EmpresaApi = {
  id: string;
  name: string;
  responsibleName: string;
  email: string;
  status: boolean;
};

export type UsuarioUI = {
  id: string;
  nome: string;
  email: string;
  perfil: "Admin" | "Colaborador" | "Terceiro" | "Cliente" | "Cliente gestor" | "Cliente funcionário";
  status: "Ativo" | "Inativo";
  online: boolean;
};

export type GrupoEmpresa = {
  empresa: string;
  usuarios: UsuarioUI[];
};

export type FormEdicao = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "COLLABORATOR" | "PJ" | "CLIENT" | "CLIENT_GESTOR" | "CLIENT_MEMBER";
  status: "ACTIVE" | "INACTIVE";
  companyId: string;
  firstAccess: boolean;
  responsible: boolean;
  specialtyIds: string[];
  rendimentoSchedule: UserRendimentoScheduleValue;
};

export type SpecialtyOption = {
  id: string;
  name: string;
  externalId: number | null;
};

export function createEmptyFormEdicao(): FormEdicao {
  return {
    id: "",
    name: "",
    email: "",
    role: "CLIENT_GESTOR",
    status: "ACTIVE",
    companyId: "",
    firstAccess: false,
    responsible: false,
    specialtyIds: [],
    rendimentoSchedule: normalizeUserRendimentoSchedule({}),
  };
}

export function resolveUserSpecialtyIds(usuario: ApiUser): string[] {
  if (usuario.specialties?.length) {
    return usuario.specialties.map((item) => item.id);
  }
  const single = resolveUserSpecialtyId(usuario);
  return single ? [single] : [];
}

export function resolveUserSpecialtyId(usuario: ApiUser): string {
  return (
    usuario.specialtyId ??
    usuario.specialty?.id ??
    usuario.specialties?.[0]?.id ??
    usuario.serviceDesks?.[0]?.id ??
    ""
  );
}

export function resolveUserSpecialtyName(usuario: ApiUser): string | null {
  return (
    usuario.specialty?.name ??
    usuario.specialties?.[0]?.name ??
    usuario.serviceDesks?.[0]?.name ??
    null
  );
}

export function mapRole(role: ApiUser["role"]): UsuarioUI["perfil"] {
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

export function mapStatus(status: ApiUser["status"]): UsuarioUI["status"] {
  return status === "ACTIVE" ? "Ativo" : "Inativo";
}

export function filterUsuarios(usuarios: ApiUser[], busca: string): ApiUser[] {
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
}

export function buildUsuariosPorEmpresa(usuariosFiltrados: ApiUser[]): GrupoEmpresa[] {
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
}

export function formEdicaoFromUser(usuario: ApiUser): FormEdicao {
  return {
    id: usuario.id,
    name: usuario.name,
    email: usuario.email,
    role: usuario.role,
    status: usuario.status,
    companyId: usuario.companyId ?? "",
    firstAccess: usuario.firstAccess,
    responsible: usuario.responsible,
    specialtyIds: resolveUserSpecialtyIds(usuario),
    rendimentoSchedule: normalizeUserRendimentoSchedule(usuario),
  };
}
