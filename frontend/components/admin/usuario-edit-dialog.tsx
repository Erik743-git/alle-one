"use client";

import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FlipCheckbox } from "@/components/ui/flip-checkbox";
import { SearchableSelectField } from "@/components/ui/searchable-select-field";
import { UserRendimentoScheduleFields } from "@/components/admin/user-rendimento-schedule-fields";
import type {
  EmpresaApi,
  FormEdicao,
  SpecialtyOption,
} from "@/lib/admin/usuarios-helpers";

type UsuarioEditDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: FormEdicao;
  onFormChange: (updater: (prev: FormEdicao) => FormEdicao) => void;
  empresas: EmpresaApi[];
  specialties: SpecialtyOption[];
  carregandoEmpresas: boolean;
  carregandoEspecialidades: boolean;
  senhaProvisoria: string;
  onSenhaProvisoriaChange: (value: string) => void;
  firstAccessInicial: boolean;
  erro?: string;
  salvando?: boolean;
  onSave: () => void;
};

export function UsuarioEditDialog({
  open,
  onOpenChange,
  form,
  onFormChange,
  empresas,
  specialties,
  carregandoEmpresas,
  carregandoEspecialidades,
  senhaProvisoria,
  onSenhaProvisoriaChange,
  firstAccessInicial,
  erro,
  salvando = false,
  onSave,
}: UsuarioEditDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) onSenhaProvisoriaChange("");
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
                value={form.name}
                onChange={(e) =>
                  onFormChange((prev) => ({ ...prev, name: e.target.value }))
                }
                className="h-11"
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label className="text-sm font-semibold text-foreground">
                Email
              </Label>
              <Input
                value={form.email}
                onChange={(e) =>
                  onFormChange((prev) => ({ ...prev, email: e.target.value }))
                }
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold text-foreground">
                Empresa
              </Label>
              <SearchableSelectField
                value={form.companyId}
                onChange={(value) =>
                  onFormChange((prev) => ({ ...prev, companyId: value }))
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
                value={form.role}
                onChange={(value) =>
                  onFormChange((prev) => ({
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
                value={form.status}
                onChange={(value) =>
                  onFormChange((prev) => ({
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
                value={form.firstAccess ? "true" : "false"}
                onChange={(value) =>
                  onFormChange((prev) => ({
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

            {form.firstAccess ? (
              <div className="space-y-2 sm:col-span-2">
                <Label className="text-sm font-semibold text-foreground">
                  Senha provisória
                  {form.firstAccess && !firstAccessInicial ? (
                    <span className="text-destructive"> *</span>
                  ) : null}
                </Label>
                <Input
                  type="password"
                  value={senhaProvisoria}
                  onChange={(e) => onSenhaProvisoriaChange(e.target.value)}
                  placeholder="Mín. 8 caracteres (A a, 0-9, especial)"
                  autoComplete="new-password"
                  className="h-11"
                />
                <p className="text-xs text-muted-foreground">
                  {firstAccessInicial
                    ? "Deixe em branco para manter a senha atual. Preencha apenas se quiser gerar uma nova senha provisória."
                    : "Obrigatória ao ativar primeiro acesso. O usuário usará esta senha no login e depois criará a senha definitiva."}
                </p>
              </div>
            ) : null}

            <div className="space-y-2 sm:col-span-2">
              <Label className="text-sm font-semibold text-foreground">
                Especialidades
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
                        onFormChange((prev) => ({ ...prev, specialtyIds: [] }))
                      }
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                        form.specialtyIds.length === 0
                          ? "bg-primary/10 text-foreground ring-1 ring-primary/40"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      }`}
                    >
                      <span
                        className={`flex size-4 shrink-0 items-center justify-center rounded border-2 ${
                          form.specialtyIds.length === 0
                            ? "border-primary bg-primary"
                            : "border-border"
                        }`}
                      >
                        {form.specialtyIds.length === 0 ? (
                          <span className="size-2 rounded-sm bg-primary-foreground" />
                        ) : null}
                      </span>
                      Nenhuma
                    </button>
                    {specialties.map((item) => {
                      const selected = form.specialtyIds.includes(item.id);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() =>
                            onFormChange((prev) => ({
                              ...prev,
                              specialtyIds: selected
                                ? prev.specialtyIds.filter((id) => id !== item.id)
                                : [...prev.specialtyIds, item.id],
                            }))
                          }
                          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                            selected
                              ? "bg-primary/10 text-foreground ring-1 ring-primary/40"
                              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                          }`}
                        >
                          <span
                            className={`flex size-4 shrink-0 items-center justify-center rounded border-2 ${
                              selected ? "border-primary bg-primary" : "border-border"
                            }`}
                          >
                            {selected ? (
                              <span className="size-2 rounded-sm bg-primary-foreground" />
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
                Selecione uma ou mais especialidades (mesas TiFlux). Use o sync
                TiFlux para preencher automaticamente.
              </p>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label className="text-sm font-semibold text-foreground">
                Responsável
              </Label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <FlipCheckbox
                  checked={form.responsible}
                  onChange={(e) =>
                    onFormChange((prev) => ({
                      ...prev,
                      responsible: e.target.checked,
                    }))
                  }
                />
                Marcar usuário como responsável
              </label>
            </div>

            <UserRendimentoScheduleFields
              role={form.role}
              value={form.rendimentoSchedule}
              onChange={(rendimentoSchedule) =>
                onFormChange((prev) => ({ ...prev, rendimentoSchedule }))
              }
            />
          </div>

          {erro ? (
            <div className="alle-alert-error mt-5 rounded-xl px-3 py-2 text-sm">
              {erro}
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-border bg-card px-6 pt-4 pb-6">
          <div className="flex w-full flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-11"
            >
              Cancelar
            </Button>

            <Button
              type="button"
              onClick={onSave}
              disabled={salvando}
              className="h-11"
            >
              {salvando ? "Salvando..." : "Salvar alterações"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
