"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getStoredUser, setStoredUser } from "@/lib/session";
import type { ModulePermission } from "@/lib/permission-modules";

type LoginResponse = {
  message: string;
  accessToken?: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: "ADMIN" | "COLLABORATOR" | "CLIENT";
    companyId: string | null;
    companyName: string | null;
    firstAccess: boolean;
    permissions: ModulePermission[];
  };
};

type ErrorResponse = {
  message?: string | string[];
  error?: string;
  statusCode?: number;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  const router = useRouter();

  useEffect(() => {
    const user = getStoredUser();
    if (user) {
      router.replace("/dashboard");
    }
  }, [router]);

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro("");

    if (!email.trim() || !senha.trim()) {
      setErro("Preencha e-mail e senha.");
      return;
    }

    try {
      setCarregando(true);

      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          password: senha,
        }),
      });

      const data = (await response.json()) as LoginResponse | ErrorResponse;

      if (!response.ok) {
        const mensagem =
          Array.isArray(data.message) ? data.message[0] : data.message;

        setErro(mensagem || "Não foi possível realizar o login.");
        return;
      }

      const loginData = data as LoginResponse;

      setStoredUser(loginData.user);

      if (loginData.user.firstAccess) {
        router.push("/primeiro-acesso");
        return;
      }

      router.push("/dashboard");
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
      <div className="absolute bottom-[-60px] left-[18%] h-44 w-44 rounded-full bg-sky-500/10 blur-3xl sm:h-64 sm:w-64 lg:h-72 lg:w-72" />

      <div className="relative z-10 w-full max-w-[360px] animate-[fadeIn_0.5s_ease-out] sm:max-w-[400px] lg:max-w-[450px]">
        <Card className="rounded-[20px] border border-white/10 bg-[#08182f]/88 shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:rounded-[22px]">
          <CardHeader className="space-y-5 px-5 pb-3 pt-5 sm:space-y-6 sm:px-7 sm:pt-7 lg:space-y-8">
            <div className="relative flex items-center">
              <Image
                src="/logo-alle.png"
                alt="Alle One"
                width={140}
                height={44}
                priority
                className="h-auto w-[110px] sm:w-[125px] lg:w-[140px]"
              />

              <a
                href="https://alletecnologia.com"
                target="_blank"
                rel="noreferrer"
                title="Retornar para Alle Tecnologia"
                className="absolute right-0 flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                <ArrowUpRight size={18} />
              </a>
            </div>

            <div className="space-y-2 text-center">
              <h1 className="font-sans text-3xl font-extrabold tracking-[-0.03em] text-white sm:text-[2.1rem] lg:text-4xl">
                Alle One
              </h1>

              <p className="font-sans text-sm font-medium text-slate-300 sm:text-[15px]">
                Acesse o portal da sua empresa
              </p>
            </div>
          </CardHeader>

          <CardContent className="px-5 pb-5 pt-1 sm:px-7 sm:pb-7">
            <form onSubmit={handleLogin} className="space-y-4 sm:space-y-5">
              <div className="space-y-2">
                <label className="font-sans text-sm font-bold text-slate-200">
                  E-mail
                </label>

                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu.email@empresa.com"
                  disabled={carregando}
                  className="font-sans h-11 rounded-xl border-white/15 bg-[#020b1b] text-sm text-white placeholder:text-slate-500 sm:h-12 sm:text-[15px]"
                />
              </div>

              <div className="space-y-2">
                <label className="font-sans text-sm font-bold text-slate-200">
                  Senha
                </label>

                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    placeholder="Digite sua senha"
                    disabled={carregando}
                    className="font-sans h-11 rounded-xl border-white/15 bg-[#020b1b] pr-12 text-sm text-white placeholder:text-slate-500 sm:h-12 sm:text-[15px]"
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={carregando}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-white"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {erro ? (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  {erro}
                </div>
              ) : null}

              <div className="flex items-center justify-between gap-3 text-xs sm:text-sm">
                <Link
                  href="/primeiro-acesso"
                  className="font-sans font-semibold text-[#12b5d9] transition hover:text-[#5fd5ee]"
                >
                  Primeiro acesso
                </Link>

                <Link
                  href="/esqueci-senha"
                  className="font-sans font-semibold text-slate-300 transition hover:text-white"
                >
                  Esqueci minha senha
                </Link>
              </div>

              <Button
                type="submit"
                disabled={carregando}
                className="font-sans h-11 w-full rounded-xl bg-[#12b5d9] text-sm font-bold text-white transition hover:bg-[#0ea5c6] sm:h-12 sm:text-[15px]"
              >
                {carregando ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Entrando...
                  </>
                ) : (
                  "Entrar"
                )}
              </Button>

              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-white/10" />
                </div>

                <div className="relative flex justify-center">
                  <span className="bg-[#08182f] px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:text-xs">
                    ou continue com
                  </span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                disabled
                className="font-sans h-11 w-full rounded-xl border-white/15 bg-white/5 text-sm font-bold text-white hover:bg-white/10 hover:text-white sm:h-12 sm:text-[15px]"
              >
                Entrar com Google
              </Button>
            </form>

            <p className="mt-5 text-center text-xs text-slate-400 sm:mt-6 sm:text-sm">
              Precisa de ajuda?{" "}
              <a
                href="#"
                className="font-bold text-[#12b5d9] transition hover:text-[#5fd5ee]"
              >
                Fale com o suporte
              </a>
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}