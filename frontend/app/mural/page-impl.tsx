"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

import ProtectedPage from "@/components/auth/protected-page";
import AppShell from "@/components/layout/app-shell";
import { MuralNoteCard, CORES_PAPEL } from "@/components/mural/mural-note-card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldLabel } from "@/components/ui/field-label";
import { FlipCheckbox } from "@/components/ui/flip-checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/lib/confirm";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  MURAL_CORES,
  muralService,
  type MuralNote,
} from "@/lib/services/mural.service";
import { cn } from "@/lib/utils";

const LIMITE_CARACTERES = 600;

type Rascunho = {
  message: string;
  color: string;
  toUserId: string;
  anonymous: boolean;
};

const RASCUNHO_VAZIO: Rascunho = {
  message: "",
  color: "amarelo",
  toUserId: "",
  anonymous: false,
};

/**
 * Mural de reconhecimento.
 *
 * A parede é um retângulo de proporção fixa e a posição de cada bilhete é
 * guardada em fração (0 a 1), então o mural fica igual em qualquer monitor:
 * o que estava no canto continua no canto.
 *
 * Arrastar usa eventos de ponteiro (funciona com mouse e com dedo) e só grava
 * ao soltar — arrastar não pode virar uma chamada por pixel.
 */
function MuralPageImpl() {
  const confirm = useConfirm();
  const paredeRef = useRef<HTMLDivElement>(null);

  const [notes, setNotes] = useState<MuralNote[]>([]);
  const [colegas, setColegas] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [novoAberto, setNovoAberto] = useState(false);
  const [rascunho, setRascunho] = useState<Rascunho>(RASCUNHO_VAZIO);

  const [aberto, setAberto] = useState<MuralNote | null>(null);
  const [editando, setEditando] = useState(false);
  const [textoEditado, setTextoEditado] = useState("");

  /** Bilhete em arrasto: id + deslocamento do clique dentro do papel. */
  const arrasto = useRef<{
    id: string;
    dx: number;
    dy: number;
    moveu: boolean;
  } | null>(null);
  const [arrastandoId, setArrastandoId] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      setCarregando(true);
      const [lista, pessoas] = await Promise.all([
        muralService.list(),
        muralService.colegas(),
      ]);
      setNotes(lista);
      setColegas(pessoas);
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível abrir o mural.",
      );
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // --- arrastar -------------------------------------------------------------

  useEffect(() => {
    if (!arrastandoId) return;

    function fracaoDoPonteiro(event: PointerEvent) {
      const parede = paredeRef.current;
      if (!parede) return null;
      const rect = parede.getBoundingClientRect();
      const estado = arrasto.current;
      if (!estado) return null;
      const x = (event.clientX - rect.left - estado.dx) / rect.width;
      const y = (event.clientY - rect.top - estado.dy) / rect.height;
      return {
        x: Math.min(1, Math.max(0, x)),
        y: Math.min(1, Math.max(0, y)),
      };
    }

    function onMove(event: PointerEvent) {
      const pos = fracaoDoPonteiro(event);
      const estado = arrasto.current;
      if (!pos || !estado) return;
      estado.moveu = true;
      setNotes((prev) =>
        prev.map((note) =>
          note.id === estado.id ? { ...note, ...pos } : note,
        ),
      );
    }

    async function onUp() {
      const estado = arrasto.current;
      arrasto.current = null;
      setArrastandoId(null);
      if (!estado?.moveu) return;
      // Só grava ao soltar: arrastar não pode virar uma chamada por pixel.
      const atual = notes.find((note) => note.id === estado.id);
      if (!atual) return;
      try {
        const salvo = await muralService.update(estado.id, {
          x: atual.x,
          y: atual.y,
        });
        setNotes((prev) =>
          prev.map((note) => (note.id === salvo.id ? salvo : note)),
        );
      } catch (err) {
        notifyError(
          err instanceof Error
            ? err.message
            : "Não foi possível guardar o lugar do bilhete.",
        );
        void carregar();
      }
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [arrastandoId, notes, carregar]);

  function comecarArrasto(
    event: React.PointerEvent<HTMLDivElement>,
    note: MuralNote,
  ) {
    // Só o dono move o próprio bilhete; o dos outros abre para leitura.
    if (!note.mine || event.button !== 0) return;
    const alvo = event.currentTarget.getBoundingClientRect();
    arrasto.current = {
      id: note.id,
      dx: event.clientX - alvo.left,
      dy: event.clientY - alvo.top,
      moveu: false,
    };
    setArrastandoId(note.id);
  }

  // --- criar, editar, remover ----------------------------------------------

  async function criar() {
    const message = rascunho.message.trim();
    if (!message) {
      notifyError("Escreva o recado antes de pregar o bilhete.");
      return;
    }
    try {
      setSalvando(true);
      const criado = await muralService.create({
        message,
        color: rascunho.color,
        anonymous: rascunho.anonymous,
        toUserId: rascunho.toUserId || null,
        // Nasce perto do meio, com um empurrãozinho para não empilhar todos
        // no mesmo ponto.
        x: 0.35 + Math.random() * 0.3,
        y: 0.25 + Math.random() * 0.4,
      });
      setNotes((prev) => [...prev, criado]);
      setRascunho(RASCUNHO_VAZIO);
      setNovoAberto(false);
      notifySuccess("Bilhete pregado no mural.");
    } catch (err) {
      notifyError(
        err instanceof Error
          ? err.message
          : "Não foi possível pregar o bilhete.",
      );
    } finally {
      setSalvando(false);
    }
  }

  async function salvarEdicao() {
    if (!aberto) return;
    const message = textoEditado.trim();
    if (!message) {
      notifyError("O bilhete não pode ficar vazio.");
      return;
    }
    try {
      setSalvando(true);
      const salvo = await muralService.update(aberto.id, { message });
      setNotes((prev) =>
        prev.map((note) => (note.id === salvo.id ? salvo : note)),
      );
      setAberto(salvo);
      setEditando(false);
      notifySuccess("Bilhete atualizado.");
    } catch (err) {
      notifyError(
        err instanceof Error
          ? err.message
          : "Não foi possível alterar o bilhete.",
      );
    } finally {
      setSalvando(false);
    }
  }

  async function remover(note: MuralNote) {
    const ok = await confirm({
      title: "Tirar o bilhete do mural?",
      description: note.mine
        ? "O seu bilhete sai da parede para todo mundo."
        : "Este bilhete é de outra pessoa e sairá da parede para todo mundo.",
      confirmText: "Tirar",
      variant: "warning",
    });
    if (!ok) return;
    try {
      await muralService.remove(note.id);
      setNotes((prev) => prev.filter((item) => item.id !== note.id));
      setAberto(null);
      notifySuccess("Bilhete retirado.");
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível tirar o bilhete.",
      );
    }
  }

  // --- tela -----------------------------------------------------------------

  return (
    <ProtectedPage>
      <AppShell>
        <div className="font-sans w-full space-y-4 pb-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Mural</h1>
              <p className="text-sm text-muted-foreground">
                Recados e agradecimentos entre a equipe. Arraste o seu bilhete
                para onde quiser; clique no dos outros para ler de perto.
              </p>
            </div>
            <Button type="button" onClick={() => setNovoAberto(true)}>
              <Plus className="mr-1 size-4" />
              Novo bilhete
            </Button>
          </div>

          {/*
            Parede de cortiça. A proporção é fixa para a posição em fração
            valer igual em qualquer monitor.
          */}
          <div
            ref={paredeRef}
            className={cn(
              "relative aspect-[16/9] w-full overflow-hidden rounded-2xl",
              "bg-[#c89a63] bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.13)_1px,transparent_0)] [background-size:7px_7px]",
              "shadow-[inset_0_0_60px_rgba(0,0,0,0.35)] ring-4 ring-[#7a4f26]",
            )}
          >
            {carregando ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="size-8 animate-spin text-white/80" />
              </div>
            ) : notes.length === 0 ? (
              <div className="flex h-full items-center justify-center px-6 text-center">
                <p className="max-w-md text-sm text-white/85">
                  A parede está vazia. Pregue o primeiro bilhete — um
                  agradecimento, um elogio, um recado para alguém do time.
                </p>
              </div>
            ) : (
              notes.map((note) => (
                <div
                  key={note.id}
                  className="absolute"
                  style={{
                    left: `${note.x * 100}%`,
                    top: `${note.y * 100}%`,
                    transform: `rotate(${note.rotation}deg)`,
                    zIndex: arrastandoId === note.id ? 30 : 10,
                  }}
                >
                  <MuralNoteCard
                    note={note}
                    arrastando={arrastandoId === note.id}
                    onPointerDown={(event) => comecarArrasto(event, note)}
                    onClick={() => {
                      // Soltar depois de arrastar não conta como clique.
                      if (arrasto.current?.moveu) return;
                      setAberto(note);
                      setEditando(false);
                      setTextoEditado(note.message);
                    }}
                    className="animate-in fade-in zoom-in-95 duration-300"
                  />
                </div>
              ))
            )}
          </div>
        </div>

        {/* --- novo bilhete --- */}
        <Dialog
          open={novoAberto}
          onOpenChange={(open) => {
            setNovoAberto(open);
            if (!open) setRascunho(RASCUNHO_VAZIO);
          }}
        >
          <DialogContent className="font-sans flex max-h-[min(84vh,680px)] max-w-2xl flex-col overflow-hidden p-0">
            <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-4">
              <DialogTitle>Novo bilhete</DialogTitle>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
              <div className="space-y-2">
                <FieldLabel className="font-sans text-sm font-semibold">
                  Para quem
                </FieldLabel>
                <select
                  value={rascunho.toUserId}
                  onChange={(event) =>
                    setRascunho((prev) => ({
                      ...prev,
                      toUserId: event.target.value,
                    }))
                  }
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                >
                  <option value="">Para o mural (sem destinatário)</option>
                  {colegas.map((pessoa) => (
                    <option key={pessoa.id} value={pessoa.id}>
                      {pessoa.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <FieldLabel className="font-sans text-sm font-semibold">
                  Recado
                </FieldLabel>
                <Textarea
                  rows={5}
                  maxLength={LIMITE_CARACTERES}
                  value={rascunho.message}
                  onChange={(event) =>
                    setRascunho((prev) => ({
                      ...prev,
                      message: event.target.value,
                    }))
                  }
                  placeholder="Ex.: o Alisson foi super prestativo quando pedi ajuda. Valeu!"
                />
                <p className="text-right text-xs text-muted-foreground">
                  {rascunho.message.length}/{LIMITE_CARACTERES}
                </p>
              </div>

              <div className="space-y-2">
                <FieldLabel className="font-sans text-sm font-semibold">
                  Cor do papel
                </FieldLabel>
                <div className="flex flex-wrap gap-2">
                  {MURAL_CORES.map((cor) => (
                    <button
                      key={cor}
                      type="button"
                      onClick={() =>
                        setRascunho((prev) => ({ ...prev, color: cor }))
                      }
                      title={cor}
                      aria-label={`Papel ${cor}`}
                      aria-pressed={rascunho.color === cor}
                      className={cn(
                        "size-9 rounded-md transition",
                        CORES_PAPEL[cor],
                        rascunho.color === cor
                          ? "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                          : "opacity-80 hover:opacity-100",
                      )}
                    />
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <FlipCheckbox
                  checked={rascunho.anonymous}
                  onChange={(event) =>
                    setRascunho((prev) => ({
                      ...prev,
                      anonymous: event.target.checked,
                    }))
                  }
                />
                <span>
                  Assinar como <strong>Anônimo</strong>
                </span>
              </label>
            </div>

            <DialogFooter
              bleed={false}
              className="shrink-0 border-t border-border/60 px-6"
            >
              <Button
                type="button"
                variant="outline"
                onClick={() => setNovoAberto(false)}
              >
                Cancelar
              </Button>
              <Button type="button" disabled={salvando} onClick={() => void criar()}>
                {salvando ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Pregando…
                  </>
                ) : (
                  "Pregar no mural"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* --- ler de perto / editar o seu --- */}
        <Dialog
          open={Boolean(aberto)}
          onOpenChange={(open) => {
            if (!open) {
              setAberto(null);
              setEditando(false);
            }
          }}
        >
          <DialogContent className="font-sans flex max-h-[min(84vh,620px)] max-w-xl flex-col overflow-hidden p-0">
            <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-4">
              <DialogTitle>
                {aberto?.mine ? "Seu bilhete" : "Bilhete do mural"}
              </DialogTitle>
            </DialogHeader>

            {aberto ? (
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                {editando ? (
                  <Textarea
                    rows={6}
                    maxLength={LIMITE_CARACTERES}
                    value={textoEditado}
                    onChange={(event) => setTextoEditado(event.target.value)}
                  />
                ) : (
                  <div className="flex justify-center">
                    <MuralNoteCard note={aberto} aberto />
                  </div>
                )}
              </div>
            ) : null}

            <DialogFooter
              bleed={false}
              className="shrink-0 items-center gap-2 border-t border-border/60 px-6 sm:justify-between"
            >
              <div>
                {aberto?.canDelete ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => aberto && void remover(aberto)}
                  >
                    <Trash2 className="mr-1 size-4" />
                    Tirar do mural
                  </Button>
                ) : null}
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
                {aberto?.mine && !editando ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditando(true)}
                  >
                    Editar
                  </Button>
                ) : null}
                {editando ? (
                  <Button
                    type="button"
                    disabled={salvando}
                    onClick={() => void salvarEdicao()}
                  >
                    {salvando ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Salvando…
                      </>
                    ) : (
                      "Salvar"
                    )}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setAberto(null)}
                  >
                    Fechar
                  </Button>
                )}
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AppShell>
    </ProtectedPage>
  );
}

export { MuralPageImpl as PortalPageComponent };
