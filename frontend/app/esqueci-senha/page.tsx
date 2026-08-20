"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { AlleBrandLogoOnDark } from "@/components/brand/alle-brand-logo";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/env";
import {
  DEFAULT_RESEND_COOLDOWN_SECONDS,
  requestPasswordResetCode,
  saveDevResetCode,
  saveResetEmail,
  setResendCooldown,
} from "@/lib/password-reset-flow";

export default function EsqueciSenhaPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro("");

    if (!email.trim()) {
      setErro("Informe seu e-mail.");
      return;
    }

    try {
      setLoading(true);
      const data = await requestPasswordResetCode(API_URL, email.trim());
      const normalized = (data.email ?? email).trim().toLowerCase();
      saveResetEmail(normalized);
      if (process.env.NODE_ENV !== "production") {
        saveDevResetCode(data.devCode);
      }
      setResendCooldown(
        data.resendCooldownSeconds ?? DEFAULT_RESEND_COOLDOWN_SECONDS,
      );
      router.push("/redefinir-senha");
    } catch (err) {
      setErro(
        err instanceof Error
          ? err.message
          : "Não foi possível processar o pedido.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <Card className="gap-3 rounded-[20px] border border-white/10 bg-[#08182f]/88 py-0 shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <CardHeader className="space-y-4 px-6 pb-1 pt-5">
          <div className="flex items-center justify-between">
            <AlleBrandLogoOnDark className="w-[108px] sm:w-[122px]" />

            <Link
              href="/login"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-slate-300 hover:bg-white/10"
            >
              <ArrowLeft size={18} />
            </Link>
          </div>

          <div className="space-y-1.5 text-center">
            <h1 className="text-[1.75rem] font-bold text-white sm:text-[1.95rem]">
              Esqueci a senha
            </h1>
            <p className="text-sm text-slate-400">
              Informe o e-mail da sua conta. Se estiver cadastrado, enviaremos um
              código de 8 caracteres para redefinir a senha.
            </p>
          </div>
        </CardHeader>

        <CardContent className="px-6 pb-5 pt-1">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-200">E-mail</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu.email@empresa.com"
                disabled={loading}
                autoComplete="email"
                className="h-11 rounded-xl border-white/15 bg-[#020b1b] text-white"
              />
            </div>

            {erro ? (
              <div className="alle-alert-error rounded-xl px-3 py-2 text-sm">
                {erro}
              </div>
            ) : null}

            <Button
              type="submit"
              disabled={loading}
              className="h-11 w-full rounded-xl bg-[#12b5d9] text-white hover:bg-[#0ea5c6]"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                "Enviar código"
              )}
            </Button>

            <div className="text-center text-sm text-slate-400">
              <Link href="/login" className="font-semibold text-[#12b5d9]">
                Voltar para login
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
