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
import { Eye, UserPlus, EyeOff } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Company = {
  id: string;
  name: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export default function ModalNovoUsuario({ open, onOpenChange }: Props) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [role, setRole] = useState("CLIENT");
  const [showPassword, setShowPassword] = useState(false);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [loadingSave, setLoadingSave] = useState(false);
  const [erro, setErro] = useState("");

  async function buscarEmpresas() {
    try {
      setLoadingCompanies(true);
      setErro("");

      const response = await authFetch(`${API_URL}/companies`);

      const data = (await response.json()) as
        | Company[]
        | { message?: string | string[] };

      if (!response.ok) {
        const message =
          !Array.isArray(data) && data.message
            ? Array.isArray(data.message)
              ? data.message[0]
              : data.message
            : "Erro ao buscar empresas.";

        setErro(message);
        return;
      }

      setCompanies(Array.isArray(data) ? data : []);
    } catch {
      setErro("Erro ao conectar com backend.");
    } finally {
      setLoadingCompanies(false);
    }
  }

  useEffect(() => {
    if (open) {
      void buscarEmpresas();
    }
  }, [open]);

  async function criarUsuario() {
    if (!nome || !email || !password || !companyId || !role) {
      setErro("Preencha todos os campos obrigatórios.");
      return;
    }

    try {
      setLoadingSave(true);
      setErro("");

      const response = await authFetch(`${API_URL}/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: nome,
          email,
          password,
          role,
          companyId,
          status: "ACTIVE",
          firstAccess: true,
        }),
      });

      const data = (await response.json()) as
        | Record<string, unknown>
        | { message?: string | string[] };

      if (!response.ok) {
        const message =
          "message" in data && data.message
            ? Array.isArray(data.message)
              ? data.message[0]
              : data.message
            : "Erro ao criar usuário.";

        setErro(message);
        return;
      }

      setNome("");
      setEmail("");
      setPassword("");
      setCompanyId("");
      setRole("CLIENT");

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
          flex max-h-[90vh] w-[95vw] max-w-[520px] flex-col overflow-hidden
          border border-border bg-card p-0 text-card-foreground
          sm:max-w-[600px]
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

              <select
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                disabled={loadingCompanies}
                className="font-sans h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">Selecione a empresa</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label className="font-sans text-sm font-semibold text-foreground">
                Perfil
              </Label>

              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="font-sans h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none"
              >
                <option value="CLIENT">Cliente</option>
                <option value="COLLABORATOR">Colaborador</option>
                <option value="ADMIN">Administrador</option>
              </select>
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