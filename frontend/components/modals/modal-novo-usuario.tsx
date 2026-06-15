"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FlipCheckbox } from "@/components/ui/flip-checkbox";
import { SearchableSelectField } from "@/components/ui/searchable-select-field";
import { Eye, UserPlus, EyeOff } from "lucide-react";
import { sortByName } from "@/lib/collections";
import { companiesService } from "@/lib/services/companies.service";
import { usersService } from "@/lib/services/users.service";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Company = {
  id: string;
  name: string;
};

type ServiceDeskOption = {
  id: string;
  name: string;
  externalId: number | null;
};

export default function ModalNovoUsuario({ open, onOpenChange }: Props) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [role, setRole] = useState("CLIENT");
  const [responsible, setResponsible] = useState(false);
  const [serviceDeskIds, setServiceDeskIds] = useState<string[]>([]);
  const [showPassword, setShowPassword] = useState(false);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [serviceDesks, setServiceDesks] = useState<ServiceDeskOption[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [loadingServiceDesks, setLoadingServiceDesks] = useState(false);
  const [loadingSave, setLoadingSave] = useState(false);
  const [erro, setErro] = useState("");

  async function buscarEmpresas() {
    try {
      setLoadingCompanies(true);
      setErro("");

      const data = await companiesService.list();
      setCompanies(sortByName(data));
    } catch {
      setErro("Erro ao conectar com backend.");
    } finally {
      setLoadingCompanies(false);
    }
  }

  useEffect(() => {
    if (open) {
      void buscarEmpresas();
      void buscarMesasDeServico();
    }
  }, [open]);

  async function buscarMesasDeServico() {
    try {
      setLoadingServiceDesks(true);
      setErro("");

      const data = await usersService.listServiceDesks();
      setServiceDesks(sortByName(data));
    } catch {
      setErro("Erro ao conectar com backend.");
    } finally {
      setLoadingServiceDesks(false);
    }
  }

  async function criarUsuario() {
    if (!nome || !email || !password || !companyId || !role) {
      setErro("Preencha todos os campos obrigatórios.");
      return;
    }

    try {
      setLoadingSave(true);
      setErro("");

      await usersService.create({
        name: nome.trim(),
        email: email.trim().toLowerCase(),
        password: password.trim(),
        role: role as "ADMIN" | "COLLABORATOR" | "PJ" | "CLIENT",
        companyId,
        status: "ACTIVE",
        firstAccess: true,
        responsible,
        serviceDeskIds,
      });

      setNome("");
      setEmail("");
      setPassword("");
      setCompanyId("");
      setRole("CLIENT");
      setResponsible(false);
      setServiceDeskIds([]);

      onOpenChange(false);
      window.location.reload();
    } catch {
      setErro("Erro ao conectar com backend.");
    } finally {
      setLoadingSave(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          font-sans
          flex max-h-[92vh] !w-[95vw] !max-w-[980px] sm:!w-[min(980px,95vw)] sm:!max-w-[980px] flex-col overflow-hidden
          border border-border bg-card p-0 text-card-foreground
        "
      >
        <div className="shrink-0 border-b border-border px-5 py-5 sm:px-6">
          <DialogHeader className="space-y-3 text-left">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary sm:h-12 sm:w-12">
              <UserPlus size={22} />
            </div>

            <div className="space-y-1">
              <DialogTitle className="font-sans text-xl font-bold text-foreground sm:text-2xl">
                Novo usuário
              </DialogTitle>

              <DialogDescription className="font-sans text-sm text-muted-foreground">
                Cadastre um usuário e vincule ele a uma empresa do portal.
              </DialogDescription>
            </div>
          </DialogHeader>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label className="font-sans text-sm font-semibold text-foreground">
                Nome completo
              </Label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: José Serpa"
                className="font-sans h-11"
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label className="font-sans text-sm font-semibold text-foreground">
                Email
              </Label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@empresa.com"
                className="font-sans h-11"
              />
            </div>

            <div className="space-y-2">
              <Label className="font-sans text-sm font-semibold text-foreground">
                Empresa
              </Label>

              <SearchableSelectField
                value={companyId}
                onChange={setCompanyId}
                options={companies.map((company) => ({
                  value: company.id,
                  label: company.name,
                }))}
                disabled={loadingCompanies}
                emptyLabel="Selecione a empresa"
              />
            </div>

            <div className="space-y-2">
              <Label className="font-sans text-sm font-semibold text-foreground">
                Perfil
              </Label>

              <SearchableSelectField
                value={role}
                onChange={setRole}
                options={[
                  { value: "ADMIN", label: "Administrador" },
                  { value: "CLIENT", label: "Cliente" },
                  { value: "COLLABORATOR", label: "Colaborador" },
                  { value: "PJ", label: "Terceiro" },
                ]}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label className="font-sans text-sm font-semibold text-foreground">
                Mesas de serviço
              </Label>
              <div className="rounded-xl border border-input bg-background p-3">
                {loadingServiceDesks ? (
                  <p className="text-sm text-muted-foreground">Carregando mesas...</p>
                ) : serviceDesks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma mesa disponível.
                  </p>
                ) : (
                  <div className="grid max-h-40 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                    {serviceDesks.map((desk) => (
                      <label
                        key={desk.id}
                        className="flex items-center gap-2 text-sm text-foreground"
                      >
                        <FlipCheckbox
                          checked={serviceDeskIds.includes(desk.id)}
                          onChange={(e) => {
                            setServiceDeskIds((prev) =>
                              e.target.checked
                                ? [...prev, desk.id]
                                : prev.filter((id) => id !== desk.id),
                            );
                          }}
                        />
                        <span>{desk.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <FlipCheckbox
                  checked={responsible}
                  onChange={(e) => setResponsible(e.target.checked)}
                />
                Marcar usuário como responsável
              </label>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label className="font-sans text-sm font-semibold text-foreground">
                Senha provisória
              </Label>
              <div className="relative">
  <Input
    type={showPassword ? "text" : "password"}
    value={password}
    onChange={(e) => setPassword(e.target.value)}
    placeholder="Digite a senha inicial"
    autoComplete="new-password"
    className="font-sans h-11 pr-10"
  />

  <button
    type="button"
    onClick={() => setShowPassword(!showPassword)}
    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
  >
    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
  </button>
</div>
            </div>
          </div>

          {erro ? (
            <div className="alle-alert-error mt-4 rounded-xl px-3 py-2 text-sm">
              {erro}
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-border bg-card px-5 py-4 sm:px-6">
          <div className="flex w-full flex-col-reverse gap-3 sm:flex-row sm:justify-end">
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
              onClick={criarUsuario}
              disabled={loadingSave}
              className="font-sans h-11"
            >
              {loadingSave ? "Criando..." : "Criar usuário"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}