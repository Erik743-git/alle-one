"use client";

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff, ArrowLeft, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

function RedefinirSenhaForm() {
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get("token")?.trim() ?? "";

  const [token, setToken] = useState("");
  const [senha, setSenha] = useState("");
  const [showSenha, setShowSenha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  useEffect(() => {
    if (tokenFromUrl) {
      setToken(tokenFromUrl);
    }
  }, [tokenFromUrl]);

  const tokenPreenchidoPeloLink = Boolean(tokenFromUrl);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setErro("");
    setSucesso("");

    if (!token.trim() || !senha) {
      setErro("Preencha todos os campos.");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(`${API_URL}/auth/redefinir-senha`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: token.trim(),
          newPassword: senha,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setErro(data.message || "Erro ao redefinir senha.");
        return;
      }

      setSucesso("Senha redefinida com sucesso!");

      setTimeout(() => {
        window.location.href = "/login";
      }, 1500);
    } catch {
      setErro("Erro ao conectar com o servidor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="font-sans relative flex min-h-screen items-center justify-center overflow-hidden bg-[#020b1b] px-4 py-6 sm:px-6 lg:px-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#149ddd_0%,#04152d_35%,#020b1b_70%,#010611_100%)]" />

      <div className="relative z-10 w-full max-w-[420px]">
        <Card className="rounded-[22px] border border-white/10 bg-[#08182f]/88 backdrop-blur-xl">
          <CardHeader className="space-y-6 px-7 pt-7 pb-3">
            <div className="flex items-center justify-between">
              <Image
                src="/logo-alle.png"
                alt="Alle One"
                width={140}
                height={44}
              />

              <Link
                href="/login"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-slate-300 hover:bg-white/10"
              >
                <ArrowLeft size={18} />
              </Link>
            </div>

            <div className="text-center space-y-2">
              <h1 className="text-3xl font-bold text-white">
                Redefinir senha
              </h1>
              <p className="text-sm text-slate-400">
                {tokenPreenchidoPeloLink
                  ? "Defina uma nova senha para sua conta."
                  : "Informe o token recebido por e-mail e a nova senha."}
              </p>
            </div>
          </CardHeader>

          <CardContent className="px-7 pb-7">
            <form onSubmit={handleSubmit} className="space-y-5">
              {!tokenPreenchidoPeloLink ? (
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-200">
                    Token
                  </label>
                  <Input
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Cole o token recebido"
                    className="h-12 rounded-xl border-white/15 bg-[#020b1b] text-white"
                  />
                </div>
              ) : null}

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

              {erro && (
                <div className="alle-alert-error rounded-xl px-3 py-2 text-sm">{erro}</div>
              )}

              {sucesso && (
                <div className="alle-alert-success rounded-xl px-3 py-2 text-sm">{sucesso}</div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="h-12 w-full bg-[#12b5d9] text-white hover:bg-[#0ea5c6]"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Redefinir senha"
                )}
              </Button>

              <div className="text-center text-sm text-slate-400">
                <Link
                  href="/login"
                  className="font-semibold text-[#12b5d9]"
                >
                  Voltar para login
                </Link>
              </div>
            </form>
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
