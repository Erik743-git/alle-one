"use client";

import {
  Building2,
  ChevronDown,
  Pencil,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  resolveUserSpecialtyName,
  type ApiUser,
  type GrupoEmpresa,
} from "@/lib/admin/usuarios-helpers";
import {
  formatUserRendimentoScheduleSummary,
  normalizeUserRendimentoSchedule,
  usesRendimentoScheduleRole,
} from "@/lib/user-rendimento-schedule";

type UsuariosCompanyListProps = {
  grupos: GrupoEmpresa[];
  usuarios: ApiUser[];
  onEdit: (id: string) => void;
  onDeactivate: (id: string) => void;
  onPermissions: (id: string, nome: string) => void;
};

export function UsuariosCompanyList({
  grupos,
  usuarios,
  onEdit,
  onDeactivate,
  onPermissions,
}: UsuariosCompanyListProps) {
  return (
    <div className="space-y-4">
      {grupos.map((grupo) => (
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
                <p className="font-semibold text-foreground">{grupo.empresa}</p>
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
                  <p className="text-sm text-muted-foreground">{usuario.email}</p>
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
                    onClick={() => onPermissions(usuario.id, usuario.nome)}
                    className="inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-xl border border-border bg-background/40 px-3 text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
                  >
                    <ShieldCheck size={15} />
                    <span className="text-xs font-semibold">Permissões</span>
                  </button>

                  <button
                    onClick={() => onEdit(usuario.id)}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background/40 text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
                    title="Editar usuário"
                  >
                    <Pencil size={16} />
                  </button>

                  <button
                    onClick={() => onDeactivate(usuario.id)}
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
  );
}
