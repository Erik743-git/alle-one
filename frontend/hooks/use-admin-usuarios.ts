"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { getApiErrorPayload } from "@/lib/api";
import { useConfirm } from "@/lib/confirm";
import { API_URL } from "@/lib/env";
import { sortByName } from "@/lib/collections";
import { usersService } from "@/lib/services/users.service";
import {
  usesRendimentoScheduleRole,
} from "@/lib/user-rendimento-schedule";
import {
  buildUsuariosPorEmpresa,
  createEmptyFormEdicao,
  filterUsuarios,
  formEdicaoFromUser,
  type ApiUser,
  type EmpresaApi,
  type FormEdicao,
  type SpecialtyOption,
} from "@/lib/admin/usuarios-helpers";

export function useAdminUsuarios() {
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

  const [formEdicao, setFormEdicao] = useState<FormEdicao>(createEmptyFormEdicao);
  const [senhaProvisoriaEdicao, setSenhaProvisoriaEdicao] = useState("");
  const [firstAccessInicialEdicao, setFirstAccessInicialEdicao] = useState(false);

  const buscarUsuarios = useCallback(async () => {
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
  }, []);

  const buscarEmpresas = useCallback(async () => {
    try {
      setCarregandoEmpresas(true);
      setErroEdicao("");

      const response = await authFetch(`${API_URL}/companies`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
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
  }, []);

  const buscarEspecialidades = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    void buscarUsuarios();
    void buscarEspecialidades();
  }, [buscarUsuarios, buscarEspecialidades]);

  const usuariosFiltrados = useMemo(
    () => filterUsuarios(usuarios, busca),
    [busca, usuarios],
  );

  const usuariosPorEmpresa = useMemo(
    () => buildUsuariosPorEmpresa(usuariosFiltrados),
    [usuariosFiltrados],
  );

  const totalUsuarios = usuariosFiltrados.length;
  const totalAdmins = usuariosFiltrados.filter((u) => u.role === "ADMIN").length;
  const totalColaboradores = usuariosFiltrados.filter(
    (u) => u.role === "COLLABORATOR" && u.status === "ACTIVE",
  ).length;
  const totalClientes = usuariosFiltrados.filter(
    (u) =>
      u.role === "CLIENT" ||
      u.role === "CLIENT_GESTOR" ||
      u.role === "CLIENT_MEMBER",
  ).length;

  const abrirEdicao = useCallback(
    async (id: string) => {
      const usuario = usuarios.find((item) => item.id === id);
      if (!usuario) return;

      if (empresas.length === 0) await buscarEmpresas();
      if (specialties.length === 0) await buscarEspecialidades();

      setErroEdicao("");
      setFormEdicao(formEdicaoFromUser(usuario));
      setSenhaProvisoriaEdicao("");
      setFirstAccessInicialEdicao(usuario.firstAccess);
      setModalEditarUsuario(true);
    },
    [buscarEmpresas, buscarEspecialidades, empresas.length, specialties.length, usuarios],
  );

  const abrirDesativacao = useCallback(
    (id: string) => {
      const usuario = usuarios.find((item) => item.id === id);
      if (!usuario) return;
      setErroDesativacao("");
      setUsuarioDesativar({ id: usuario.id, nome: usuario.name });
      setModalDesativarUsuario(true);
    },
    [usuarios],
  );

  const offerLinkExistingUser = useCallback(
    async (payload: Record<string, unknown>) => {
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
    },
    [buscarUsuarios, confirm, empresas, formEdicao.companyId, formEdicao.role],
  );

  const salvarEdicao = useCallback(async () => {
    if (!formEdicao.id) return;

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
        specialtyIds: formEdicao.specialtyIds,
        specialtyId: formEdicao.specialtyIds[0] ?? null,
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
  }, [
    buscarUsuarios,
    firstAccessInicialEdicao,
    formEdicao,
    offerLinkExistingUser,
    senhaProvisoriaEdicao,
  ]);

  const confirmarDesativacaoUsuario = useCallback(async () => {
    if (!usuarioDesativar?.id) return;

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
  }, [buscarUsuarios, usuarioDesativar?.id]);

  const abrirPermissoes = useCallback(
    (usuarioId: string, nome: string) => {
      const full = usuarios.find((u) => u.id === usuarioId);
      setUsuarioSelecionado(nome);
      setPermissoesUserId(usuarioId);
      setPermissoesUserRole(full?.role);
      setModalPermissoes(true);
    },
    [usuarios],
  );

  return {
    modalNovoUsuario,
    setModalNovoUsuario,
    modalPermissoes,
    setModalPermissoes,
    modalEditarUsuario,
    setModalEditarUsuario,
    modalDesativarUsuario,
    setModalDesativarUsuario,
    usuarioSelecionado,
    permissoesUserId,
    setPermissoesUserId,
    permissoesUserRole,
    setPermissoesUserRole,
    usuarioDesativar,
    busca,
    setBusca,
    usuarios,
    empresas,
    specialties,
    carregando,
    carregandoEmpresas,
    carregandoEspecialidades,
    salvandoEdicao,
    desativandoUsuario,
    erro,
    erroEdicao,
    erroDesativacao,
    formEdicao,
    setFormEdicao,
    senhaProvisoriaEdicao,
    setSenhaProvisoriaEdicao,
    firstAccessInicialEdicao,
    usuariosPorEmpresa,
    totalUsuarios,
    totalAdmins,
    totalColaboradores,
    totalClientes,
    buscarUsuarios,
    abrirEdicao,
    abrirDesativacao,
    salvarEdicao,
    confirmarDesativacaoUsuario,
    abrirPermissoes,
  };
}
