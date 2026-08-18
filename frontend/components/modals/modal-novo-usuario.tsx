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
import { getApiErrorPayload } from "@/lib/api";
import { useConfirm } from "@/lib/confirm";
import { companiesService } from "@/lib/services/companies.service";
import { usersService } from "@/lib/services/users.service";
import { UserRendimentoScheduleFields } from "@/components/admin/user-rendimento-schedule-fields";
import {
  defaultUserRendimentoSchedule,
  type UserRendimentoScheduleValue,
} from "@/lib/user-rendimento-schedule";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Company = {
  id: string;
  name: string;
};

type SpecialtyOption = {
  id: string;
  name: string;
  externalId: number | null;
};

export default function ModalNovoUsuario({ open, onOpenChange }: Props) {
  const confirm = useConfirm();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [role, setRole] = useState("CLIENT_GESTOR");
  const [responsible, setResponsible] = useState(false);
  const [specialtyId, setSpecialtyId] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rendimentoSchedule, setRendimentoSchedule] =
    useState<UserRendimentoScheduleValue>(defaultUserRendimentoSchedule());

  const [companies, setCompanies] = useState<Company[]>([]);
  const [specialties, setSpecialties] = useState<SpecialtyOption[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [loadingSpecialties, setLoadingSpecialties] = useState(false);
  const [loadingSave, setLoadingSave] = useState(false);
  const [erro, setErro] = useState("");

  function resetForm() {
    setNome("");
    setEmail("");
    setPassword("");
    setCompanyId("");
    setRole("CLIENT_GESTOR");
    setResponsible(false);
    setSpecialtyId("");
    setRendimentoSchedule(defaultUserRendimentoSchedule());
    setErro("");
  }

  function formatCompanyList(names: string[]) {
    if (names.length === 0) return "";
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} e ${names[1]}`;
    return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
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

    const targetCompany = companies.find((c) => c.id === companyId);
    const targetName = targetCompany?.name ?? "a empresa selecionada";

    if (!canLink || !userId) {
      setErro(
        "Já existe um usuário com este e-mail, mas ele não é um usuário cliente e não pode receber acesso multi-empresa.",
      );
      return;
    }

    if (companyIds.includes(companyId)) {
      setErro(
        `O usuário ${userName} já possui acesso à empresa ${targetName}.`,
      );
      return;
    }

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
      role === "CLIENT_GESTOR" || role === "CLIENT_MEMBER"
        ? role
        : "CLIENT_MEMBER";

    await usersService.upsertCompanyMembership(userId, {
      companyId,
      clientRole,
    });

    resetForm();
    onOpenChange(false);
    window.location.reload();
  }

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
      void buscarEspecialidades();
    }
  }, [open]);

  async function buscarEspecialidades() {
    try {
      setLoadingSpecialties(true);
      setErro("");

      const data = await usersService.listSpecialties();
      setSpecialties(sortByName(data));
    } catch {
      setErro("Erro ao conectar com backend.");
    } finally {
      setLoadingSpecialties(false);
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
        role: role as
          | "ADMIN"
          | "COLLABORATOR"
          | "PJ"
          | "CLIENT"
          | "CLIENT_GESTOR"
          | "CLIENT_MEMBER",
        companyId,
        status: "ACTIVE",
        firstAccess: true,
        responsible,
        specialtyId: specialtyId || null,
        rendimentoCustomSchedule: rendimentoSchedule.rendimentoCustomSchedule,
        rendimentoDailyWorkMinutes: rendimentoSchedule.rendimentoCustomSchedule
          ? rendimentoSchedule.rendimentoDailyWorkMinutes
          : null,
        rendimentoLunchMinutes: rendimentoSchedule.rendimentoCustomSchedule
          ? rendimentoSchedule.rendimentoLunchMinutes
          : null,
      });

      resetForm();
      onOpenChange(false);
      window.location.reload();
    } catch (err) {
      const payload = getApiErrorPayload(err);
      if (payload?.code === "EMAIL_EXISTS") {
        try {
          await offerLinkExistingUser(payload);
        } catch (linkErr) {
          setErro(
            linkErr instanceof Error
              ? linkErr.message
              : "Erro ao conceder acesso à empresa.",
          );
        }
        return;
      }

      setErro(
        err instanceof Error ? err.message : "Erro ao conectar com backend.",
      );
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
                  { value: "CLIENT_GESTOR", label: "Cliente (gestor)" },
                  { value: "CLIENT_MEMBER", label: "Cliente (funcionário)" },
                  { value: "COLLABORATOR", label: "Colaborador" },
                  { value: "PJ", label: "Terceiro" },
                ]}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label className="font-sans text-sm font-semibold text-foreground">
                Especialidade
              </Label>
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-border bg-muted/20 p-2">
                {loadingSpecialties ? (
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
                      onClick={() => setSpecialtyId("")}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                        !specialtyId
                          ? "bg-primary/10 text-foreground ring-1 ring-primary/40"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      }`}
                    >
                      <span
                        className={`flex size-4 shrink-0 items-center justify-center rounded-full border-2 ${
                          !specialtyId ? "border-primary" : "border-border"
                        }`}
                      >
                        {!specialtyId ? (
                          <span className="size-2 rounded-full bg-primary" />
                        ) : null}
                      </span>
                      Nenhuma
                    </button>
                    {specialties.map((item) => {
                      const selected = specialtyId === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSpecialtyId(item.id)}
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
              <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <FlipCheckbox
                  checked={responsible}
                  onChange={(e) => setResponsible(e.target.checked)}
                />
                Marcar usuário como responsável
              </label>
            </div>

            <UserRendimentoScheduleFields
              role={
                role as
                  | "ADMIN"
                  | "COLLABORATOR"
                  | "PJ"
                  | "CLIENT"
                  | "CLIENT_GESTOR"
                  | "CLIENT_MEMBER"
              }
              value={rendimentoSchedule}
              onChange={setRendimentoSchedule}
            />

            <div className="space-y-2 sm:col-span-2">
              <Label className="font-sans text-sm font-semibold text-foreground">
                Senha provisória
              </Label>
              <div className="relative">
  <Input
    type={showPassword ? "text" : "password"}
    value={password}
    onChange={(e) => setPassword(e.target.value)}
    placeholder="Mín. 8 caracteres (A a, 0-9, especial)"
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
              <p className="text-xs text-muted-foreground">
                Inclua maiúscula, minúscula, número e caractere especial (ex.: Teste123!).
              </p>
            </div>
          </div>

          {erro ? (
            <div className="alle-alert-error mt-4 rounded-xl px-3 py-2 text-sm">
              {erro}
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-border bg-card px-5 pt-4 pb-6 sm:px-6">
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