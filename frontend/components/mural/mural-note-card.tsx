"use client";

import { cn } from "@/lib/utils";
import type { MuralNote } from "@/lib/services/mural.service";

/**
 * Cores do papel. Tons claros nos dois temas de propósito: bilhete de recado
 * é papel, e papel não muda de cor quando a sala apaga a luz. O texto é
 * sempre escuro pelo mesmo motivo.
 */
export const CORES_PAPEL: Record<string, string> = {
  amarelo: "bg-[#fdf0a8] text-[#4a3f12]",
  rosa: "bg-[#fbd0dd] text-[#4d1f2d]",
  verde: "bg-[#c8ecc4] text-[#20401d]",
  azul: "bg-[#c6e2f7] text-[#12354d]",
  lilas: "bg-[#ddd0f5] text-[#31204d]",
  laranja: "bg-[#fdd7b0] text-[#4d3115]",
};

export function corDoPapel(cor: string): string {
  return CORES_PAPEL[cor] ?? CORES_PAPEL.amarelo;
}

/** A tarraxinha que prende o papel na parede. */
function Tarracha({ cor }: { cor: string }) {
  return (
    <span
      aria-hidden
      className="absolute left-1/2 top-0 size-5 -translate-x-1/2 -translate-y-1/2"
    >
      <span
        className={cn(
          "block size-5 rounded-full shadow-[0_2px_4px_rgba(0,0,0,0.35)]",
          cor,
        )}
      >
        {/* O brilho fora de centro é o que dá volume de alfinete. */}
        <span className="block size-2 translate-x-1 translate-y-1 rounded-full bg-white/60" />
      </span>
    </span>
  );
}

const CORES_TARRACHA = [
  "bg-rose-500",
  "bg-sky-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-violet-500",
];

/** Sempre a mesma tarracha para o mesmo bilhete, sem guardar isso no banco. */
function tarrachaDe(id: string): string {
  let soma = 0;
  for (let i = 0; i < id.length; i += 1) soma += id.charCodeAt(i);
  return CORES_TARRACHA[soma % CORES_TARRACHA.length];
}

type Props = {
  note: MuralNote;
  /** Papel em foco (aberto para leitura) cresce e fica reto. */
  aberto?: boolean;
  arrastando?: boolean;
  onPointerDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onClick?: () => void;
  /** Clique numa reação; ausente deixa as reações só como leitura. */
  onReagir?: (emoji: string) => void;
  style?: React.CSSProperties;
  className?: string;
};

export function MuralNoteCard({
  note,
  aberto = false,
  arrastando = false,
  onPointerDown,
  onClick,
  onReagir,
  style,
  className,
}: Props) {
  const assinatura = note.anonymous
    ? "Anônimo"
    : (note.authorName ?? "Alguém");

  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick?.();
        }
      }}
      style={style}
      className={cn(
        "flex w-56 flex-col gap-2 rounded-sm px-4 pb-3 pt-5 shadow-[0_6px_14px_rgba(0,0,0,0.28)]",
        "font-[var(--font-handwriting,inherit)] select-none",
        // A transição some enquanto arrasta: com ela o papel "nada" atrás do
        // mouse em vez de acompanhar.
        arrastando
          ? "cursor-grabbing"
          : "cursor-grab transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_12px_22px_rgba(0,0,0,0.34)]",
        aberto && "w-80 cursor-default",
        corDoPapel(note.color),
        className,
      )}
    >
      <Tarracha cor={tarrachaDe(note.id)} />

      {note.isNew ? (
        <span className="absolute -right-2 -top-2 rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow animate-in zoom-in">
          novo
        </span>
      ) : null}

      {note.toName ? (
        <p className="text-xs font-semibold uppercase tracking-wide opacity-70">
          Para {note.toName}
        </p>
      ) : null}

      <p
        className={cn(
          "whitespace-pre-wrap break-words leading-snug",
          aberto ? "text-base" : "line-clamp-6 text-sm",
        )}
      >
        {note.message}
      </p>

      <div className="mt-auto flex items-end justify-between gap-2 pt-1">
        <div className="flex flex-wrap gap-1">
          {note.reactions.map((reacao) => (
            <button
              key={reacao.emoji}
              type="button"
              disabled={!onReagir}
              onClick={(event) => {
                // O clique na reação não abre o bilhete.
                event.stopPropagation();
                onReagir?.(reacao.emoji);
              }}
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[11px] leading-none transition",
                "bg-black/10 hover:bg-black/20",
                reacao.mine && "ring-1 ring-black/40",
                !onReagir && "cursor-default hover:bg-black/10",
              )}
            >
              {reacao.emoji} {reacao.count}
            </button>
          ))}
        </div>
        <p className="text-right text-xs italic opacity-75">— {assinatura}</p>
      </div>
    </div>
  );
}
