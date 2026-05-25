"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, ArrowLeft, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { clearSession, getStoredUser } from "@/lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

function validatePassword(password: string) {
  if (password.length < 8) {
    return "A senha deve ter pelo menos 8 caracteres.";
  }

  if (!/[a-z]/.test(password)) {
    return "A senha deve ter pelo menos 1 letra minúscula.";
  }

  if (!/[A-Z]/.test(password)) {
    return "A senha deve ter pelo menos 1 letra maiúscula.";
  }

  if (!/\d/.test(password)) {
    return "A senha deve ter pelo menos 1 número.";
  }

  if (!/[^A-Za-z\d]/.test(password)) {
    return "A senha deve ter pelo menos 1 caractere especial.";
  }

  return "";
}

export default function PrimeiroAcessoPage() {
  const router = useRouter();

  const storedUser = useMemo(() => {
    if (typeof window === "undefined") {
      return null;
    }

    return getStoredUser();
  }, []);

  const [showPassword, setShowPassword] = useState(false);
  const [showNovaPassword, setShowNovaPassword] = useState(false);
  const [showConfirmarPassword, setShowConfirmarPassword] = useState(false);

  const [email, setEmail] = useState(storedUser?.email ?? "");
  const [senhaProvisoria, setSenhaProvisoria] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");

  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!storedUser) {
      router.replace("/login");
      return;
    }

    if (!storedUser.firstAccess) {
      router.replace("/dashboard");
    }
  }, [router, storedUser]);

  function voltarParaLogin() {
    clearSession();
    router.replace("/login");

    setTimeout(() => {
      window.location.replace("/login");
    }, 50);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErro("");

    if (!email.trim() || !senhaProvisoria.trim() || !novaSenha.trim()) {
      setErro("Preencha todos os campos obrigatórios.");
      return;
    }

    const passwordError = validatePassword(novaSenha);

    if (passwordError) {
      setErro(passwordError);
      return;
    }

    if (novaSenha !== confirmarSenha) {
      setErro("A confirmação da nova senha não confere.");
      return;
    }

    try {
      setCarregando(true);

      const response = await fetch(`${API_URL}/auth/primeiro-acesso`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          currentPassword: senhaProvisoria,
          newPassword: novaSenha,
        }),
      });

      const data = (await response.json()) as
        | { message?: string | string[] }
        | Record<string, unknown>;

      if (!response.ok) {
        const message =
          "message" in data && data.message
            ? Array.isArray(data.message)
              ? data.message[0]
              : data.message
            : "Não foi possível concluir o primeiro acesso.";

        setErro(message);
        return;
      }

      clearSession();
      router.replace("/login");

      setTimeout(() => {
        window.location.replace("/login");
      }, 50);
    } catch {
      setErro("Erro ao conectar com o servidor.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <main className="font-sans relative flex min-h-screen items-center justify-center overflow-hidden bg-[#020b1b] px-4 py-6 sm:px-6 lg:px-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#149ddd_0%,#04152d_35%,#020b1b_70%,#010611_100%)]" />
      <div className="absolute left-[-120px] top-[10%] h-48 w-48 rounded-full bg-cyan-400/10 blur-3xl sm:h-64 sm:w-64 lg:h-72 lg:w-72" />
      <div className="absolute right-[-80px] top-[35%] h-52 w-52 rounded-full bg-blue-500/10 blur-3xl sm:h-72 sm:w-72 lg:h-80 lg:w-80" />

      <div className="relative z-10 w-full max-w-[420px] animate-[fadeIn_0.5s_ease-out]">
        <Card className="rounded-[22px] border border-white/10 bg-[#08182f]/88 shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <CardHeader className="space-y-6 px-7 pb-3 pt-7">
            <div className="flex items-center justify-between">
              <Image
                src="/logo-alle.png"
                alt="Alle One"
                width={140}
                height={44}
                priority
                className="h-auto w-[140px]"
              />

              <button
                type="button"
                onClick={voltarParaLogin}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                <ArrowLeft size={18} />
              </button>
            </div>

            <div className="space-y-2 text-center">
              <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-white">
                Primeiro acesso
              </h1>

              <p className="text-sm text-slate-300">
                Defina uma nova senha para acessar o portal
              </p>
            </div>
          </CardHeader>

          <CardContent className="px-7 pb-7">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-200">
                  E-mail corporativo
                </label>

                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu.email@empresa.com"
                  className="h-12 rounded-xl border-white/15 bg-[#020b1b] text-white placeholder:text-slate-500"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-200">
                  Senha provisória
                </label>

                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={senhaProvisoria}
                    onChange={(e) => setSenhaProvisoria(e.target.value)}
                    placeholder="Digite a senha recebida"
                    className="h-12 rounded-xl border-white/15 bg-[#020b1b] pr-12 text-white placeholder:text-slate-500"
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-white"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-200">
                  Nova senha
                </label>

                <div className="relative">
                  <Input
                    type={showNovaPassword ? "text" : "password"}
                    value={novaSenha}
                    onChange={(e) => setNovaSenha(e.target.value)}
                    placeholder="Digite a nova senha"
                    className="h-12 rounded-xl border-white/15 bg-[#020b1b] pr-12 text-white placeholder:text-slate-500"
                  />

                  <button
                    type="button"
                    onClick={() => setShowNovaPassword(!showNovaPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-white"
                  >
                    {showNovaPassword ? (
                      <EyeOff size={18} />
                    ) : (
                      <Eye size={18} />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-200">
                  Confirmar nova senha
                </label>

                <div className="relative">
                  <Input
                    type={showConfirmarPassword ? "text" : "password"}
                    value={confirmarSenha}
                    onChange={(e) => setConfirmarSenha(e.target.value)}
                    placeholder="Confirme a nova senha"
                    className="h-12 rounded-xl border-white/15 bg-[#020b1b] pr-12 text-white placeholder:text-slate-500"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowConfirmarPassword(!showConfirmarPassword)
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-white"
                  >
                    {showConfirmarPassword ? (
                      <EyeOff size={18} />
                    ) : (
                      <Eye size={18} />
                    )}
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#020b1b] p-4 text-xs text-slate-400">
                A nova senha deve conter pelo menos 8 caracteres, letra
                minúscula, letra maiúscula, número e caractere especial.
              </div>

              {erro ? (
                <div className="alle-alert-error rounded-xl px-3 py-2 text-sm">
                  {erro}
                </div>
              ) : null}

              <Button
                type="submit"
                disabled={carregando}
                className="h-12 w-full rounded-xl bg-[#12b5d9] font-bold text-white hover:bg-[#0ea5c6]"
              >
                {carregando ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Definir nova senha"
                )}
              </Button>

              <div className="text-center text-sm text-slate-400">
                Já possui acesso?{" "}
                <button
                  type="button"
                  onClick={voltarParaLogin}
                  className="font-semibold text-[#12b5d9] transition hover:text-[#5fd5ee]"
                >
                  Voltar para login
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}