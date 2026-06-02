"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlleBrandLogoOnDark } from "@/components/brand/alle-brand-logo";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, ArrowLeft, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { validatePassword } from "@/lib/password-policy";
import {
  clearResetFlow,
  DEFAULT_RESEND_COOLDOWN_SECONDS,
  getDevResetCode,
  getResendCooldownRemainingMs,
  getResetEmail,
  requestPasswordResetCode,
  saveDevResetCode,
  setResendCooldown,
} from "@/lib/password-reset-flow";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

type Step = "code" | "password" | "done";

function normalizeCode(value: string) {
  return value.replace(/\D/g, "").slice(0, 6);
}

function tokenForApi(value: string) {
  const trimmed = value.trim();
  const digitsOnly = trimmed.replace(/\s/g, "");
  if (/^\d{6}$/.test(digitsOnly)) return digitsOnly;
  return trimmed;
}

function RedefinirSenhaForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get("token")?.trim() ?? "";

  const [resetEmail, setResetEmail] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("code");
  const [token, setToken] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [showSenha, setShowSenha] = useState(false);
  const [showConfirmar, setShowConfirmar] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [validatingUrlToken, setValidatingUrlToken] = useState(false);
  const [erro, setErro] = useState("");
  const [info, setInfo] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [cooldownMs, setCooldownMs] = useState(0);

  const validatedToken = step === "password" || step === "done" ? token : "";

  useEffect(() => {
    const stored = getResetEmail();
    if (!stored) {
      router.replace("/esqueci-senha");
      return;
    }
    setResetEmail(stored);
    setDevCode(getDevResetCode());
    setCooldownMs(getResendCooldownRemainingMs());
  }, [router]);

  useEffect(() => {
    if (cooldownMs <= 0) return;
    const timer = setInterval(() => {
      const remaining = getResendCooldownRemainingMs();
      setCooldownMs(remaining);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownMs]);

  const validateCode = useCallback(async (code: string) => {
    const normalized = tokenForApi(code);
    if (normalized.length < 6) {
      setErro("Informe o código de 6 dígitos recebido por e-mail.");
      return false;
    }

    setErro("");
    setInfo("");
    setLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/auth/validar-token-redefinicao`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: normalized }),
        },
      );
      const data = (await response.json()) as { message?: string | string[] };

      if (!response.ok) {
        const msg = Array.isArray(data.message)
          ? data.message.join(", ")
          : data.message;
        setErro(msg || "Código inválido ou expirado.");
        return false;
      }

      setToken(normalized);
      setStep("password");
      return true;
    } catch {
      setErro("Erro ao conectar com o servidor.");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!tokenFromUrl || step !== "code" || !resetEmail) return;

    const apiToken = tokenForApi(tokenFromUrl);
    if (apiToken.length >= 6) {
      setToken(/^\d{6}$/.test(apiToken) ? apiToken : tokenFromUrl);
      setValidatingUrlToken(true);
      void validateCode(apiToken).finally(() => setValidatingUrlToken(false));
    }
  }, [tokenFromUrl, step, resetEmail, validateCode]);

  async function handleResendCode() {
    if (!resetEmail || cooldownMs > 0 || resending) return;

    setErro("");
    setInfo("");
    try {
      setResending(true);
      const data = await requestPasswordResetCode(API_URL, resetEmail);
      saveDevResetCode(data.devCode);
      setDevCode(data.devCode ?? getDevResetCode());
      setResendCooldown(
        data.resendCooldownSeconds ?? DEFAULT_RESEND_COOLDOWN_SECONDS,
      );
      setCooldownMs(getResendCooldownRemainingMs());
      setToken("");
      setInfo(
        data.devCode
          ? "Novo código gerado (desenvolvimento — veja abaixo)."
          : "Novo código enviado. Verifique sua caixa de entrada.",
      );
    } catch (err) {
      setErro(
        err instanceof Error
          ? err.message
          : "Não foi possível reenviar o código.",
      );
    } finally {
      setResending(false);
    }
  }

  async function handleValidateCode(e: React.FormEvent) {
    e.preventDefault();
    await validateCode(token);
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setInfo("");

    const policyError = validatePassword(senha);
    if (policyError) {
      setErro(policyError);
      return;
    }

    if (senha !== confirmarSenha) {
      setErro("A confirmação da nova senha não confere.");
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/auth/redefinir-senha`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: validatedToken,
          newPassword: senha,
        }),
      });

      const data = (await response.json()) as { message?: string | string[] };

      if (!response.ok) {
        const msg = Array.isArray(data.message)
          ? data.message.join(", ")
          : data.message;
        setErro(msg || "Erro ao redefinir senha.");
        return;
      }

      setStep("done");
      clearResetFlow();
      setTimeout(() => {
        window.location.href = "/login";
      }, 2000);
    } catch {
      setErro("Erro ao conectar com o servidor.");
    } finally {
      setLoading(false);
    }
  }

  const busy = loading || validatingUrlToken;
  const resendDisabled = resending || cooldownMs > 0 || busy;
  const resendLabel =
    cooldownMs > 0
      ? `Reenviar código (${Math.ceil(cooldownMs / 1000)}s)`
      : resending
        ? "Reenviando..."
        : "Reenviar código";

  if (!resetEmail) {
    return (
      <main className="font-sans flex min-h-screen items-center justify-center bg-[#020b1b] text-slate-300">
        <Loader2 className="h-8 w-8 animate-spin text-[#12b5d9]" />
      </main>
    );
  }

  return (
    <main className="font-sans relative flex min-h-screen items-center justify-center overflow-hidden bg-[#020b1b] px-4 py-6 sm:px-6 lg:px-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#149ddd_0%,#04152d_35%,#020b1b_70%,#010611_100%)]" />

      <div className="relative z-10 w-full max-w-[420px]">
        <Card className="rounded-[22px] border border-white/10 bg-[#08182f]/88 backdrop-blur-xl">
          <CardHeader className="space-y-6 px-7 pt-7 pb-3">
            <div className="flex items-center justify-between">
              <AlleBrandLogoOnDark className="w-[140px]" />

              <Link
                href="/login"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-slate-300 hover:bg-white/10"
              >
                <ArrowLeft size={18} />
              </Link>
            </div>

            <div className="space-y-2 text-center">
              <h1 className="text-3xl font-bold text-white">
                Redefinir senha
              </h1>
              <p className="text-sm text-slate-400">
                {step === "code" && (
                  <>
                    Informe o código de 6 dígitos enviado para{" "}
                    <span className="font-semibold text-slate-200">
                      {resetEmail}
                    </span>
                    . O e-mail precisa ser uma caixa real para receber o
                    código.
                  </>
                )}
                {step === "password" &&
                  "Código confirmado. Defina sua nova senha."}
                {step === "done" && "Senha alterada com sucesso!"}
              </p>
              <div className="flex justify-center gap-2 pt-1">
                {(["code", "password"] as const).map((item, index) => {
                  const active =
                    step === item ||
                    (step === "done" && item === "password");
                  const done =
                    (item === "code" &&
                      (step === "password" || step === "done")) ||
                    (item === "password" && step === "done");
                  return (
                    <span
                      key={item}
                      className={`h-2 w-10 rounded-full ${
                        done
                          ? "bg-[#12b5d9]"
                          : active
                            ? "bg-[#12b5d9]/70"
                            : "bg-white/15"
                      }`}
                      title={`Etapa ${index + 1}`}
                    />
                  );
                })}
              </div>
            </div>
          </CardHeader>

          <CardContent className="px-7 pb-7">
            {step === "code" ? (
              <form onSubmit={handleValidateCode} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-200">
                    Código
                  </label>
                  <Input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={token}
                    onChange={(e) => setToken(normalizeCode(e.target.value))}
                    placeholder="000000"
                    maxLength={6}
                    disabled={busy}
                    className="h-12 rounded-xl border-white/15 bg-[#020b1b] text-center text-lg tracking-[0.35em] text-white"
                  />
                </div>

                {devCode ? (
                  <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-sm text-amber-100">
                    <p className="font-semibold text-amber-50">
                      Ambiente de desenvolvimento
                    </p>
                    <p className="mt-1 text-amber-100/90">
                      O cadastro usa um e-mail fictício ({resetEmail}). Use o
                      código abaixo para testar:
                    </p>
                    <p className="mt-2 text-center font-mono text-2xl font-bold tracking-[0.35em] text-white">
                      {devCode}
                    </p>
                  </div>
                ) : null}

                {info ? (
                  <div className="alle-alert-success rounded-xl px-3 py-2 text-sm">
                    {info}
                  </div>
                ) : null}

                {erro ? (
                  <div className="alle-alert-error rounded-xl px-3 py-2 text-sm">
                    {erro}
                  </div>
                ) : null}

                <Button
                  type="submit"
                  disabled={busy || token.length < 6}
                  className="h-12 w-full bg-[#12b5d9] text-white hover:bg-[#0ea5c6]"
                >
                  {busy ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Validando...
                    </>
                  ) : (
                    "Continuar"
                  )}
                </Button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => void handleResendCode()}
                    disabled={resendDisabled}
                    className="text-sm font-semibold text-[#12b5d9] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {resending ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {resendLabel}
                      </span>
                    ) : (
                      resendLabel
                    )}
                  </button>
                </div>
              </form>
            ) : null}

            {step === "password" ? (
              <form onSubmit={handleResetPassword} className="space-y-5">
                <div className="alle-alert-success rounded-xl px-3 py-2 text-sm">
                  Código confirmado. Defina sua nova senha abaixo.
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-200">
                    Nova senha
                  </label>
                  <div className="relative">
                    <Input
                      type={showSenha ? "text" : "password"}
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      placeholder="Digite a nova senha"
                      disabled={busy}
                      className="h-12 rounded-xl border-white/15 bg-[#020b1b] pr-12 text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSenha(!showSenha)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      {showSenha ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-200">
                    Confirmar nova senha
                  </label>
                  <div className="relative">
                    <Input
                      type={showConfirmar ? "text" : "password"}
                      value={confirmarSenha}
                      onChange={(e) => setConfirmarSenha(e.target.value)}
                      placeholder="Repita a nova senha"
                      disabled={busy}
                      className="h-12 rounded-xl border-white/15 bg-[#020b1b] pr-12 text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmar(!showConfirmar)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      {showConfirmar ? (
                        <EyeOff size={18} />
                      ) : (
                        <Eye size={18} />
                      )}
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-500">
                  Mínimo 8 caracteres, com maiúscula, minúscula, número e
                  caractere especial.
                </p>

                {erro ? (
                  <div className="alle-alert-error rounded-xl px-3 py-2 text-sm">
                    {erro}
                  </div>
                ) : null}

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      setStep("code");
                      setSenha("");
                      setConfirmarSenha("");
                      setErro("");
                      setInfo("");
                    }}
                    className="h-12 flex-1 border-white/20 bg-transparent text-white hover:bg-white/10"
                  >
                    Voltar
                  </Button>
                  <Button
                    type="submit"
                    disabled={busy}
                    className="h-12 flex-[2] bg-[#12b5d9] text-white hover:bg-[#0ea5c6]"
                  >
                    {busy ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      "Salvar nova senha"
                    )}
                  </Button>
                </div>
              </form>
            ) : null}

            {step === "done" ? (
              <div className="space-y-4 text-center">
                <div className="alle-alert-success rounded-xl px-3 py-2 text-sm">
                  Senha redefinida com sucesso. Redirecionando para o login...
                </div>
                <Link href="/login" className="text-sm font-semibold text-[#12b5d9]">
                  Ir para login agora
                </Link>
              </div>
            ) : null}

            {step === "code" ? (
              <div className="mt-4 text-center text-sm text-slate-400">
                <Link
                  href="/esqueci-senha"
                  className="font-semibold text-[#12b5d9]"
                >
                  Usar outro e-mail
                </Link>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

export default function RedefinirSenhaPage() {
  return (
    <Suspense
      fallback={
        <main className="font-sans flex min-h-screen items-center justify-center bg-[#020b1b] text-slate-300">
          <Loader2 className="h-8 w-8 animate-spin text-[#12b5d9]" />
        </main>
      }
    >
      <RedefinirSenhaForm />
    </Suspense>
  );
}
