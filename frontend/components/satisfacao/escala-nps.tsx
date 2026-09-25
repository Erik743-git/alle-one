"use client";

import { cn } from "@/lib/utils";

/** Cor de cada faixa: detrator (0–6), neutro (7–8), promotor (9–10). */
function corDaNota(n: number, ativa: boolean): string {
  if (!ativa) return "bg-white/5 text-slate-200 hover:bg-white/15";
  if (n <= 6) return "bg-rose-500 text-white";
  if (n <= 8) return "bg-amber-400 text-slate-950";
  return "bg-emerald-500 text-white";
}

/**
 * Escala de 0 a 10 do NPS. Um grupo de rádio para leitor de tela e teclado
 * (setas mudam a nota). No celular quebra em duas linhas sem rolar.
 */
export function EscalaNps({
  valor,
  onChange,
  claro = false,
}: {
  valor: number | null;
  onChange: (nota: number) => void;
  /** Fundo claro (pop-up do portal) em vez do cartão escuro da tela pública. */
  claro?: boolean;
}) {
  const mover = (delta: number) => {
    const atual = valor ?? (delta > 0 ? -1 : 11);
    onChange(Math.min(10, Math.max(0, atual + delta)));
  };
  return (
    <div className="space-y-1.5">
      <div
        role="radiogroup"
        aria-label="Nota de 0 a 10"
        className="grid grid-cols-6 gap-1.5 sm:grid-cols-11"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowUp") {
            e.preventDefault();
            mover(1);
          } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
            e.preventDefault();
            mover(-1);
          }
        }}
      >
        {Array.from({ length: 11 }, (_, n) => {
          const ativa = valor === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={ativa}
              aria-label={`Nota ${n}`}
              tabIndex={ativa || (valor == null && n === 0) ? 0 : -1}
              onClick={() => onChange(n)}
              className={cn(
                "h-10 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400",
                claro && !ativa
                  ? "bg-muted text-foreground hover:bg-muted/70"
                  : corDaNota(n, ativa),
              )}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div
        className={cn(
          "flex justify-between text-xs",
          claro ? "text-muted-foreground" : "text-slate-400",
        )}
      >
        <span>Não recomendaria</span>
        <span>Recomendaria com certeza</span>
      </div>
    </div>
  );
}
