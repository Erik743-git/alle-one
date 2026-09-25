"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Loader2, Star } from "lucide-react";

import { EscalaNps } from "@/components/satisfacao/escala-nps";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { isClientPortalRole } from "@/lib/app-roles";
import { useAuth } from "@/lib/auth-context";
import { notifyError, notifySuccess } from "@/lib/notify";
import { npsService, type PopupSatisfacao } from "@/lib/services/nps.service";
import { cn } from "@/lib/utils";

/** Telas sem sessão ou de fluxo próprio: o pop-up nunca aparece nelas. */
const ROTAS_SEM_POPUP = [
  "/login",
  "/esqueci-senha",
  "/redefinir-senha",
  "/primeiro-acesso",
  "/satisfacao/",
  "/nps/",
];

/**
 * Pop-up de satisfação do portal do cliente. A API decide o que mostrar
 * (NPS antes da avaliação, no máximo um por dia); aqui só se pergunta uma
 * vez por sessão. Fechar sem responder = "Agora não" (não volta).
 */
export function PopupSatisfacaoHost() {
  const { authenticated, user } = useAuth();
  const pathname = usePathname() ?? "";
  const perguntouPara = useRef<string | null>(null);
  const [popup, setPopup] = useState<PopupSatisfacao | null>(null);
  const [nota, setNota] = useState<number | null>(null);
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);

  const podePerguntar =
    authenticated &&
    !!user &&
    isClientPortalRole(user.role) &&
    !user.firstAccess &&
    !ROTAS_SEM_POPUP.some((r) => pathname.startsWith(r));

  useEffect(() => {
    if (!podePerguntar || !user) return;
    if (perguntouPara.current === user.id) return;
    perguntouPara.current = user.id;
    let cancelado = false;
    npsService
      .popup()
      .then((r) => {
        if (!cancelado && r.popup) setPopup(r.popup);
      })
      // Pop-up é convite: falha aqui não atrapalha o portal.
      .catch(() => undefined);
    return () => {
      cancelado = true;
    };
  }, [podePerguntar, user]);

  if (!popup) return null;
  const ehNps = popup.tipo === "NPS";

  function fechar() {
    setPopup(null);
    setNota(null);
    setComentario("");
  }

  async function agoraNao() {
    const atual = popup;
    fechar();
    if (atual)
      await npsService
        .dispensar(atual.tipo, atual.token)
        .catch(() => undefined);
  }

  async function enviar() {
    if (!popup || nota == null) return;
    setEnviando(true);
    try {
      if (popup.tipo === "NPS") {
        await npsService.responderNps(popup.token, nota, comentario);
      } else {
        await npsService.responderAvaliacao(popup.token, nota, comentario);
      }
      notifySuccess("Obrigado! Sua resposta foi registrada.");
      fechar();
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível enviar.",
      );
    } finally {
      setEnviando(false);
    }
  }

  const notaBaixa = nota != null && (ehNps ? nota <= 6 : nota <= 2);

  return (
    <Dialog
      open
      onOpenChange={(aberto) => {
        if (!aberto && !enviando) void agoraNao();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {ehNps
              ? "Quanto você recomendaria a Alle?"
              : `Como foi o atendimento do chamado #${popup.ticketNumber}?`}
          </DialogTitle>
          <DialogDescription>
            {popup.tipo === "NPS"
              ? "De 0 a 10, quanto você recomendaria a Alle Tecnologia a um colega ou outra empresa?"
              : [
                  popup.titulo,
                  popup.responsavel
                    ? `Atendido por ${popup.responsavel}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {ehNps ? (
            <EscalaNps valor={nota} onChange={setNota} claro />
          ) : (
            <div
              role="radiogroup"
              aria-label="Nota de 1 a 5 estrelas"
              className="flex justify-center gap-1.5"
            >
              {[1, 2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={nota === v}
                  aria-label={`${v} de 5`}
                  onClick={() => setNota(v)}
                  className="rounded-lg p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Star
                    className={cn(
                      "size-8",
                      nota != null && v <= nota
                        ? "fill-amber-400 text-amber-400"
                        : "text-muted-foreground",
                    )}
                  />
                </button>
              ))}
            </div>
          )}
          <div className="space-y-1.5">
            <label
              htmlFor="popup-comentario"
              className="text-sm text-muted-foreground"
            >
              {ehNps ? "Por quê?" : "Quer contar o que achou?"} (opcional)
            </label>
            <Textarea
              id="popup-comentario"
              rows={3}
              maxLength={2000}
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              className="resize-none"
              placeholder={
                notaBaixa
                  ? "O que precisamos melhorar? Isso chega direto a quem pode resolver."
                  : "Escreva aqui, se quiser."
              }
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="ghost"
            onClick={() => void agoraNao()}
            disabled={enviando}
          >
            Agora não
          </Button>
          <Button
            type="button"
            onClick={() => void enviar()}
            disabled={nota == null || enviando}
          >
            {enviando ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
