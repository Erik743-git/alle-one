"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Check, Loader2, Star } from "lucide-react";

import { AlleBrandLogoOnDark } from "@/components/brand/alle-brand-logo";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { API_URL } from "@/lib/env";
import { cn } from "@/lib/utils";

type Pesquisa = {
  ticketNumber: number;
  title: string | null;
  clientName: string | null;
  requestorName: string | null;
  responsibleName: string | null;
  rating: number | null;
  comment: string | null;
  answeredAt: string | null;
};

const LEGENDA: Record<number, { texto: string; cor: string }> = {
  1: { texto: "Muito ruim", cor: "text-rose-300" },
  2: { texto: "Ruim", cor: "text-orange-300" },
  3: { texto: "Regular", cor: "text-amber-300" },
  4: { texto: "Bom", cor: "text-lime-300" },
  5: { texto: "Excelente", cor: "text-emerald-300" },
};

/** Cartão escuro sobre o fundo da marca, como as telas de acesso. */
function Painel({ children }: { children: React.ReactNode }) {
  return (
    <AuthShell contentClassName="items-center justify-center">
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6 py-6">
        <AlleBrandLogoOnDark className="h-9 w-auto drop-shadow" />
        <div className="w-full rounded-2xl border border-white/10 bg-slate-950/85 p-6 shadow-2xl backdrop-blur-sm sm:p-8">
          {children}
        </div>
      </div>
    </AuthShell>
  );
}

/**
 * Tela que o cliente abre pelo e-mail de fechamento. Sem login: o token do
 * link já diz qual chamado é. Se ele clicou numa estrela no e-mail, a nota
 * vem pela query e já chega gravada — aqui ele confirma ou comenta.
 */
export function PesquisaSatisfacao() {
  const params = useParams<{ token: string }>();
  const search = useSearchParams();
  const token = String(params?.token ?? "");
  const notaDoLink = Number(search.get("nota"));

  const [pesquisa, setPesquisa] = useState<Pesquisa | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [nota, setNota] = useState(0);
  const [hover, setHover] = useState(0);
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const enviar = useCallback(
    async (valor: number, texto: string, silencioso = false) => {
      if (valor < 1 || valor > 5) return;
      if (!silencioso) setEnviando(true);
      setErro(null);
      try {
        const res = await fetch(`${API_URL}/satisfacao/${token}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            rating: valor,
            comment: texto,
            channel: "EMAIL",
          }),
        });
        if (!res.ok) {
          const corpo = await res.json().catch(() => null);
          throw new Error(corpo?.message ?? "Não foi possível registrar.");
        }
        // Quando a nota veio de um clique no e-mail, a pessoa segue na tela
        // para escrever o comentário: trocar para o "Obrigado" aqui tirava
        // essa chance dela.
        if (!silencioso) setEnviado(true);
      } catch (err) {
        if (!silencioso) {
          setErro(
            err instanceof Error ? err.message : "Não foi possível registrar.",
          );
        }
      } finally {
        if (!silencioso) setEnviando(false);
      }
    },
    [token],
  );

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/satisfacao/${token}`);
        if (!res.ok) throw new Error("Pesquisa não encontrada ou já expirada.");
        const dados: Pesquisa = await res.json();
        if (cancelado) return;
        setPesquisa(dados);
        const daLink =
          Number.isInteger(notaDoLink) && notaDoLink >= 1 && notaDoLink <= 5;
        setNota(daLink ? notaDoLink : (dados.rating ?? 0));
        setComentario(dados.comment ?? "");
        // Veio de uma estrela do e-mail: grava na hora, para a nota não se
        // perder se a pessoa fechar a aba sem comentar.
        if (daLink && !dados.answeredAt) {
          void enviar(notaDoLink, "", true);
        }
      } catch (err) {
        if (!cancelado) {
          setErro(
            err instanceof Error ? err.message : "Não foi possível carregar.",
          );
        }
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [token, notaDoLink, enviar]);

  if (carregando) {
    return (
      <Painel>
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-300">
          <Loader2 className="size-4 animate-spin" />
          Carregando…
        </div>
      </Painel>
    );
  }

  if (erro && !pesquisa) {
    return (
      <Painel>
        <p className="py-8 text-center text-sm text-slate-300">{erro}</p>
      </Painel>
    );
  }

  if (enviado) {
    return (
      <Painel>
        <div className="space-y-4 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-400/30">
            <Check className="size-7 text-emerald-300" />
          </div>
          <div className="space-y-1">
            <p className="text-2xl font-semibold text-white">Obrigado!</p>
            <p className="text-sm text-slate-300">
              Sua avaliação do chamado #{pesquisa?.ticketNumber} foi registrada.
            </p>
          </div>
          <div className="flex items-center justify-center gap-1 pt-1">
            {[1, 2, 3, 4, 5].map((v) => (
              <Star
                key={v}
                className={cn(
                  "size-6",
                  v <= nota
                    ? "fill-amber-400 text-amber-400"
                    : "text-slate-700",
                )}
              />
            ))}
          </div>
          {nota <= 2 ? (
            <p className="text-sm text-slate-300">
              Sentimos muito. Alguém da nossa equipe vai entrar em contato.
            </p>
          ) : null}
        </div>
      </Painel>
    );
  }

  const exibida = hover || nota;
  const legenda = LEGENDA[exibida];

  return (
    <Painel>
      <div className="space-y-6">
        <div className="space-y-2 text-center">
          <span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-slate-200">
            Chamado #{pesquisa?.ticketNumber}
          </span>
          <h1 className="text-balance text-xl font-semibold leading-snug text-white">
            {pesquisa?.title ?? "—"}
          </h1>
          {pesquisa?.responsibleName ? (
            <p className="text-sm text-slate-400">
              Atendido por {pesquisa.responsibleName}
            </p>
          ) : null}
        </div>

        <div className="space-y-3 rounded-xl bg-white/5 p-5 text-center">
          <p className="text-base font-medium text-white">
            Como foi o nosso atendimento?
          </p>
          <div className="flex items-center justify-center gap-1.5">
            {[1, 2, 3, 4, 5].map((valor) => (
              <button
                key={valor}
                type="button"
                onClick={() => setNota(valor)}
                onMouseEnter={() => setHover(valor)}
                onMouseLeave={() => setHover(0)}
                aria-label={`${valor} de 5`}
                className="rounded-lg p-1 transition-transform duration-150 hover:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              >
                <Star
                  className={cn(
                    "size-10 transition-colors",
                    valor <= exibida
                      ? "fill-amber-400 text-amber-400"
                      : "text-slate-600",
                  )}
                />
              </button>
            ))}
          </div>
          <p
            className={cn(
              "h-5 text-sm font-medium",
              legenda?.cor ?? "text-transparent",
            )}
          >
            {legenda?.texto ?? "Toque em uma estrela"}
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="comentario" className="text-sm text-slate-300">
            Quer contar o que achou?{" "}
            <span className="text-slate-500">(opcional)</span>
          </label>
          <Textarea
            id="comentario"
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            rows={3}
            className="resize-none border-white/10 bg-white/5 text-white placeholder:text-slate-500"
            placeholder={
              nota > 0 && nota <= 2
                ? "O que deu errado? Isso chega direto para quem pode resolver."
                : "Escreva aqui, se quiser."
            }
          />
        </div>

        {erro ? <p className="text-sm text-rose-300">{erro}</p> : null}

        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={nota < 1 || enviando}
          onClick={() => void enviar(nota, comentario)}
        >
          {enviando ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Enviar avaliação
        </Button>

        <p className="text-center text-xs text-slate-500">
          Leva um segundo e ajuda muito a melhorar o nosso atendimento.
        </p>
      </div>
    </Painel>
  );
}
