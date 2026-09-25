"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Check, Loader2 } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { EscalaNps } from "@/components/satisfacao/escala-nps";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { API_URL } from "@/lib/env";

type Pesquisa = {
  nome: string | null;
  empresa: string;
  nota: number | null;
  comentario: string | null;
  respondidaEm: string | null;
  editavel: boolean;
};

function Painel({ children }: { children: React.ReactNode }) {
  return (
    <AuthShell contentClassName="items-center justify-center">
      <div className="mx-auto w-full max-w-md py-4">
        <div className="w-full rounded-2xl border border-white/10 bg-slate-950/85 p-5 shadow-2xl backdrop-blur-sm">
          {children}
        </div>
      </div>
    </AuthShell>
  );
}

/**
 * NPS pelo link do e-mail, sem login: o token é da pessoa que recebeu. Se ela
 * clicou num número no e-mail, a nota chega gravada e aqui ela conta o
 * porquê (pode trocar a nota por 24 h).
 */
export function PesquisaNps() {
  const params = useParams<{ token: string }>();
  const search = useSearchParams();
  const token = String(params?.token ?? "");
  const notaDoLink = search.get("nota");

  const [pesquisa, setPesquisa] = useState<Pesquisa | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [nota, setNota] = useState<number | null>(null);
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const enviar = useCallback(
    async (valor: number, texto: string, silencioso = false) => {
      if (!silencioso) setEnviando(true);
      setErro(null);
      try {
        const res = await fetch(`${API_URL}/nps/${encodeURIComponent(token)}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            nota: valor,
            comentario: texto,
            canal: "EMAIL",
          }),
        });
        if (!res.ok) {
          const corpo = await res.json().catch(() => null);
          throw new Error(corpo?.message ?? "Não foi possível registrar.");
        }
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
        const res = await fetch(`${API_URL}/nps/${encodeURIComponent(token)}`);
        if (!res.ok) throw new Error("Pesquisa não encontrada.");
        const dados: Pesquisa = await res.json();
        if (cancelado) return;
        setPesquisa(dados);
        const n = notaDoLink == null ? NaN : Number(notaDoLink);
        const daLink = Number.isInteger(n) && n >= 0 && n <= 10;
        setNota(daLink ? n : dados.nota);
        setComentario(dados.comentario ?? "");
        // Número clicado no e-mail: grava já, para não se perder se a pessoa
        // fechar a aba sem escrever.
        if (daLink && dados.editavel) void enviar(n, "", true);
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

  if (enviado || (pesquisa?.respondidaEm && !pesquisa.editavel)) {
    const final = enviado ? nota : pesquisa?.nota;
    return (
      <Painel>
        <div className="space-y-3 text-center" role="status">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-400/30">
            <Check className="size-6 text-emerald-300" />
          </div>
          <p className="text-2xl font-semibold text-white">Obrigado!</p>
          <p className="text-sm text-slate-300">
            {enviado ? "Sua resposta foi registrada" : "Você já respondeu"}:
            nota <strong className="text-white">{final}</strong> de 10.
          </p>
          {final != null && final <= 6 ? (
            <p className="text-sm text-slate-300">
              Obrigado pela franqueza. Alguém da nossa diretoria vai falar com
              você.
            </p>
          ) : null}
        </div>
      </Painel>
    );
  }

  return (
    <Painel>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (nota != null) void enviar(nota, comentario);
        }}
      >
        <div className="space-y-1 text-center">
          <span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-slate-200">
            {pesquisa?.empresa}
          </span>
          <h1 className="text-balance text-base font-semibold leading-snug text-white">
            De 0 a 10, quanto você recomendaria a Alle Tecnologia a um colega ou
            outra empresa?
          </h1>
        </div>

        <EscalaNps valor={nota} onChange={setNota} />

        <div className="space-y-1.5">
          <label htmlFor="porque" className="text-sm text-slate-300">
            Por quê? <span className="text-slate-500">(opcional)</span>
          </label>
          <Textarea
            id="porque"
            value={comentario}
            maxLength={2000}
            onChange={(e) => setComentario(e.target.value)}
            rows={3}
            className="resize-none border-white/10 bg-white/5 text-white placeholder:text-slate-500"
            placeholder={
              nota != null && nota <= 6
                ? "O que precisamos melhorar? Isso chega direto à diretoria."
                : "Conte o que pesou na sua nota, se quiser."
            }
          />
        </div>

        {erro ? (
          <p className="text-sm text-rose-300" role="alert">
            {erro}
          </p>
        ) : null}

        <Button
          type="submit"
          className="w-full"
          disabled={nota == null || enviando}
        >
          {enviando ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Enviar resposta
        </Button>
      </form>
    </Painel>
  );
}
