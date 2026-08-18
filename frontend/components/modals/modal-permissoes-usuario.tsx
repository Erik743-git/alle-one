"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Check, Loader2 } from "lucide-react";
import {
  PORTAL_PERMISSION_MODULES,
  type PermissionModuleKey,
} from "@/lib/permission-modules";
import {
  permissionsService,
  type UserPermissionsPayload,
} from "@/lib/services/permissions.service";

const MODULOS = PORTAL_PERMISSION_MODULES;

function presetAtivo(module: PermissionModuleKey): UserPermissionsPayload {
  if (module === "GMUD") {
    return {
      module,
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: false,
      canApprove: true,
    };
  }
  if (module === "INVENTARIO") {
    return {
      module,
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: false,
      canApprove: false,
    };
  }
  if (module === "ADMIN") {
    return {
      module,
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
      canApprove: true,
    };
  }
  return {
    module,
    canView: true,
    canCreate: false,
    canEdit: false,
    canDelete: false,
    canApprove: false,
  };
}

function presetInativo(module: PermissionModuleKey): UserPermissionsPayload {
  return {
    module,
    canView: false,
    canCreate: false,
    canEdit: false,
    canDelete: false,
    canApprove: false,
  };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  usuarioNome?: string;
  userId: string | null;
  userRole?:
    | "ADMIN"
    | "COLLABORATOR"
    | "PJ"
    | "CLIENT"
    | "CLIENT_GESTOR"
    | "CLIENT_MEMBER";
  onSaved?: () => void;
};

export default function ModalPermissoesUsuario({
  open,
  onOpenChange,
  usuarioNome = "Usuário",
  userId,
  userRole,
  onSaved,
}: Props) {
  const [ativo, setAtivo] = useState<Record<PermissionModuleKey, boolean>>(() => {
    const init: Partial<Record<PermissionModuleKey, boolean>> = {};
    for (const m of MODULOS) {
      init[m.key] = false;
    }
    return init as Record<PermissionModuleKey, boolean>;
  });
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!open || !userId || userRole === "ADMIN") {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        setCarregando(true);
        setErro("");
        const data = await permissionsService.getForUser(userId);
        if (cancelled) return;
        setAtivo((prev) => {
          const next: Record<PermissionModuleKey, boolean> = { ...prev };
          for (const m of MODULOS) {
            const eff = data.effective.find((e) => e.module === m.key);
            next[m.key] = eff?.canView === true;
          }
          return next;
        });
      } catch (e) {
        if (!cancelled) {
          setErro(
            e instanceof Error ? e.message : "Não foi possível carregar permissões.",
          );
        }
      } finally {
        if (!cancelled) {
          setCarregando(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, userId, userRole]);

  function toggleModulo(key: PermissionModuleKey) {
    setAtivo((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function salvar() {
    if (!userId || userRole === "ADMIN") {
      return;
    }

    const payload: UserPermissionsPayload[] = MODULOS.map((m) =>
      ativo[m.key] ? presetAtivo(m.key) : presetInativo(m.key),
    );

    try {
      setSalvando(true);
      setErro("");
      await permissionsService.replaceForUser(userId, payload);
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      setErro(
        e instanceof Error ? e.message : "Não foi possível salvar permissões.",
      );
    } finally {
      setSalvando(false);
    }
  }

  const isAdminTarget = userRole === "ADMIN";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          font-sans
          flex max-h-[90vh] w-[95vw] max-w-[520px] flex-col overflow-hidden
          border border-border bg-card p-0 text-card-foreground
          sm:max-w-[620px]
        "
      >
        <div className="shrink-0 border-b border-border px-5 py-5 sm:px-6">
          <DialogHeader className="space-y-3 text-left">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-[0_0_20px_rgba(18,181,217,0.12)] sm:h-12 sm:w-12">
              <ShieldCheck size={22} />
            </div>

            <div className="space-y-1">
              <DialogTitle className="font-sans text-xl font-bold text-foreground sm:text-2xl">
                Permissões do usuário
              </DialogTitle>

              <DialogDescription className="font-sans text-sm text-muted-foreground">
                Módulos liberados para{" "}
                <strong className="text-foreground">{usuarioNome}</strong>. Perfis
                ADMIN possuem acesso total e não usam esta matriz.
              </DialogDescription>
            </div>
          </DialogHeader>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
          {isAdminTarget ? (
            <p className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
              Usuários administradores têm acesso irrestrito ao portal. Não é
              necessário configurar módulos.
            </p>
          ) : null}

          {!userId ? (
            <p className="text-sm text-muted-foreground">Selecione um usuário válido.</p>
          ) : null}

          {carregando ? (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              Carregando…
            </div>
          ) : null}

          {erro ? (
            <p className="alle-alert-error mb-4 rounded-xl px-3 py-2 text-sm">{erro}</p>
          ) : null}

          {!carregando && userId && !isAdminTarget ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {MODULOS.map((modulo) => {
                const on = ativo[modulo.key];

                return (
                  <button
                    key={modulo.key}
                    type="button"
                    onClick={() => toggleModulo(modulo.key)}
                    className={`
                    group flex items-center justify-between rounded-2xl border px-4 py-4 text-left transition-all duration-200
                    ${
                      on
                        ? "border-primary/40 bg-primary/10 shadow-[0_0_0_1px_rgba(18,181,217,0.18)]"
                        : "border-border bg-muted/40 hover:bg-muted/30"
                    }
                  `}
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-foreground">
                        {modulo.label}
                      </span>
                      <span
                        className={`mt-1 text-xs ${
                          on ? "text-primary" : "text-muted-foreground"
                        }`}
                      >
                        {on ? "Acesso liberado" : "Sem acesso"}
                      </span>
                    </div>

                    <div
                      className={`
                      flex h-6 w-6 items-center justify-center rounded-lg border transition-all duration-200
                      ${
                        on
                          ? "border-primary bg-primary text-primary-foreground shadow-[0_0_14px_rgba(18,181,217,0.35)]"
                          : "border-border bg-background/40 text-transparent group-hover:border-border"
                      }
                    `}
                    >
                      <Check size={14} strokeWidth={3} />
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        <DialogFooter className="!mx-0 shrink-0 border-t border-border bg-card px-5 pt-4 pb-7 sm:px-6">
          <div className="mt-2 flex w-full flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="font-sans h-11"
            >
              Cancelar
            </Button>

            <Button
              type="button"
              disabled={salvando || !userId || isAdminTarget || carregando}
              onClick={() => void salvar()}
              className="font-sans h-11"
            >
              {salvando ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando…
                </>
              ) : (
                "Salvar permissões"
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
