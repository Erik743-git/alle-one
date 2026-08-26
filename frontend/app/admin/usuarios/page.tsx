"use client";

import AppShell from "@/components/layout/app-shell";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import ModalNovoUsuario from "@/components/modals/modal-novo-usuario";
import ModalPermissoesUsuario from "@/components/modals/modal-permissoes-usuario";
import { UsuarioDeactivateDialog } from "@/components/admin/usuario-deactivate-dialog";
import { UsuarioEditDialog } from "@/components/admin/usuario-edit-dialog";
import { UsuariosCompanyList } from "@/components/admin/usuarios-company-list";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Users,
  Plus,
  Search,
  ShieldCheck,
  Building2,
  UserCog,
} from "lucide-react";
import { useAdminUsuarios } from "@/hooks/use-admin-usuarios";

export default function AdminUsuariosPage() {
  const vm = useAdminUsuarios();

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
                onClick={() => vm.setModalNovoUsuario(true)}
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
                    <p className="text-3xl font-bold">{vm.totalUsuarios}</p>
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
                      {vm.usuariosPorEmpresa.length}
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
                    <p className="text-3xl font-bold">{vm.totalAdmins}</p>
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
                    <p className="text-3xl font-bold">{vm.totalColaboradores}</p>
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
                        value={vm.busca}
                        onChange={(e) => vm.setBusca(e.target.value)}
                        placeholder="Buscar usuário..."
                        className="h-11 pl-10"
                      />
                    </div>
                  </div>

                  {vm.carregando ? (
                    <div className="rounded-2xl border border-border bg-muted/40 p-6 text-sm text-muted-foreground">
                      Carregando usuários...
                    </div>
                  ) : vm.erro ? (
                    <div className="alle-alert-error rounded-2xl p-6 text-sm">
                      {vm.erro}
                    </div>
                  ) : vm.usuariosPorEmpresa.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/40 p-6 text-sm text-muted-foreground">
                      Nenhum usuário encontrado.
                    </div>
                  ) : (
                    <UsuariosCompanyList
                      grupos={vm.usuariosPorEmpresa}
                      usuarios={vm.usuarios}
                      onEdit={(id) => void vm.abrirEdicao(id)}
                      onDeactivate={vm.abrirDesativacao}
                      onPermissions={vm.abrirPermissoes}
                    />
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
                          {vm.totalClientes}
                        </p>
                      </div>

                      <div className="rounded-xl border border-border bg-muted/40 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Colaboradores
                        </p>
                        <p className="mt-2 text-xl font-bold text-foreground">
                          {vm.totalColaboradores}
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
            open={vm.modalNovoUsuario}
            onOpenChange={(open) => {
              vm.setModalNovoUsuario(open);
              if (!open) void vm.buscarUsuarios();
            }}
          />

          <ModalPermissoesUsuario
            open={vm.modalPermissoes}
            onOpenChange={(open) => {
              vm.setModalPermissoes(open);
              if (!open) {
                vm.setPermissoesUserId(null);
                vm.setPermissoesUserRole(undefined);
              }
            }}
            usuarioNome={vm.usuarioSelecionado}
            userId={vm.permissoesUserId}
            userRole={vm.permissoesUserRole}
            onSaved={() => void vm.buscarUsuarios()}
          />

          <UsuarioEditDialog
            open={vm.modalEditarUsuario}
            onOpenChange={vm.setModalEditarUsuario}
            form={vm.formEdicao}
            onFormChange={vm.setFormEdicao}
            empresas={vm.empresas}
            specialties={vm.specialties}
            carregandoEmpresas={vm.carregandoEmpresas}
            carregandoEspecialidades={vm.carregandoEspecialidades}
            senhaProvisoria={vm.senhaProvisoriaEdicao}
            onSenhaProvisoriaChange={vm.setSenhaProvisoriaEdicao}
            firstAccessInicial={vm.firstAccessInicialEdicao}
            erro={vm.erroEdicao}
            salvando={vm.salvandoEdicao}
            onSave={() => void vm.salvarEdicao()}
          />

          <UsuarioDeactivateDialog
            open={vm.modalDesativarUsuario}
            onOpenChange={vm.setModalDesativarUsuario}
            usuarioNome={vm.usuarioDesativar?.nome}
            erro={vm.erroDesativacao}
            loading={vm.desativandoUsuario}
            onConfirm={() => void vm.confirmarDesativacaoUsuario()}
          />
        </AppShell>
      </PermissionGate>
    </ProtectedPage>
  );
}
