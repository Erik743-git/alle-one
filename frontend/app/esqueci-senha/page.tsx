"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export default function EsqueciSenhaPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [enviado, setEnviado] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro("");
    setEnviado(false);

    if (!email.trim()) {
      setErro("Informe seu e-mail.");
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/auth/esqueci-senha`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        setErro(
          typeof data.message === "string"
            ? data.message
            : "Não foi possível processar o pedido.",
        );
        return;
      }

      setEnviado(true);
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

            <div className="space-y-2 text-center">
              <h1 className="text-3xl font-bold text-white">Esqueci a senha</h1>
              <p className="text-sm text-slate-400">
                Informe o e-mail da sua conta. Se ele estiver cadastrado,
                enviaremos um link para redefinir a senha.
              </p>
            </div>
          </CardHeader>

          <CardContent className="px-7 pb-7">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-200">
                  E-mail
                </label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu.email@empresa.com"
                  disabled={loading || enviado}
                  autoComplete="email"
                  className="h-12 rounded-xl border-white/15 bg-[#020b1b] text-white"
                />
              </div>

              {erro ? (
                <div className="text-sm text-red-400">{erro}</div>
              ) : null}

              {enviado ? (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                  Se o e-mail estiver cadastrado, você receberá um link para
                  redefinir a senha. Verifique também a caixa de spam.
                </div>
              ) : null}

              <Button
                type="submit"
                disabled={loading || enviado}
                className="h-12 w-full bg-[#12b5d9] text-white hover:bg-[#0ea5c6]"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : enviado ? (
                  "Pedido registrado"
                ) : (
                  "Enviar link"
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
