"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Loader2, Star } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { API_URL } from "@/lib/env";

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

const LEGENDA = [
  "",
  "Muito ruim",
  "Ruim",
  "Regular",
  "Bom",
  "Excelente",
] as const;

/**
 * Tela que o cliente abre pelo e-mail de fechamento. Sem login: o token do
 * link já diz qual chamado é. Se ele clicou numa estrela no e-mail, a nota
 * vem pela query e é gravada na hora — aqui ele só confirma ou comenta.
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
    async (valor: number, texto: string) => {
      if (valor < 1 || valor > 5) return;
      setEnviando(true);
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
        setEnviado(true);
      } catch (err) {
        setErro(
          err instanceof Error ? err.message : "Não foi possível registrar.",
        );
      } finally {
        setEnviando(false);
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
        const inicial =
          Number.isInteger(notaDoLink) && notaDoLink >= 1 && notaDoLink <= 5
            ? notaDoLink
            : (dados.rating ?? 0);
        setNota(inicial);
        setComentario(dados.comment ?? "");
        // Clicou a estrela no e-mail: já grava, para a nota não se perder se
        // a pessoa fechar a aba sem comentar.
        if (
          Number.isInteger(notaDoLink) &&
          notaDoLink >= 1 &&
          notaDoLink <= 5 &&
          !dados.answeredAt
        ) {
          void enviar(notaDoLink, "");
          setEnviado(false);
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
      <AuthShell>
        <Card className="w-full max-w-lg">
          <CardContent className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Carregando…
          </CardContent>
        </Card>
      </AuthShell>
    );
  }

  if (erro && !pesquisa) {
    return (
      <AuthShell>
        <Card className="w-full max-w-lg">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {erro}
          </CardContent>
        </Card>
      </AuthShell>
    );
  }

  if (enviado) {
    return (
      <AuthShell>
        <Card className="w-full max-w-lg">
          <CardContent className="space-y-3 py-10 text-center">
            <p className="text-2xl font-semibold">Obrigado!</p>
            <p className="text-sm text-muted-foreground">
              Sua avaliação do chamado #{pesquisa?.ticketNumber} foi registrada.
            </p>
          </CardContent>
        </Card>
      </AuthShell>
    );
  }

  const exibida = hover || nota;

  return (
    <AuthShell>
      <Card className="w-full max-w-lg">
        <CardHeader className="space-y-1">
          <p className="text-sm text-muted-foreground">
            Chamado #{pesquisa?.ticketNumber}
          </p>
          <h1 className="text-xl font-semibold">{pesquisa?.title ?? "—"}</h1>
          {pesquisa?.responsibleName ? (
            <p className="text-sm text-muted-foreground">
              Atendimento: {pesquisa.responsibleName}
            </p>
          ) : null}
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="space-y-2">
            <p className="text-sm font-medium">Como foi o nosso atendimento?</p>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((valor) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => setNota(valor)}
                  onMouseEnter={() => setHover(valor)}
                  onMouseLeave={() => setHover(0)}
                  aria-label={`${valor} de 5`}
                  className="rounded p-1 transition-transform hover:scale-110"
                >
                  <Star
                    className={
                      valor <= exibida
                        ? "size-9 fill-amber-400 text-amber-400"
                        : "size-9 text-muted-foreground/40"
                    }
                  />
                </button>
              ))}
            </div>
            <p className="h-5 text-sm text-muted-foreground">
              {exibida ? LEGENDA[exibida] : ""}
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="comentario" className="text-sm font-medium">
              Quer contar o que achou?{" "}
              <span className="font-normal text-muted-foreground">
                (opcional)
              </span>
            </label>
            <Textarea
              id="comentario"
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              rows={4}
              placeholder={
                nota > 0 && nota <= 2
                  ? "O que deu errado? Isso chega direto para quem pode resolver."
                  : "Escreva aqui, se quiser."
              }
            />
          </div>

          {erro ? <p className="text-sm text-destructive">{erro}</p> : null}

          <Button
            type="button"
            className="w-full"
            disabled={nota < 1 || enviando}
            onClick={() => void enviar(nota, comentario)}
          >
            {enviando ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : null}
            Enviar avaliação
          </Button>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
