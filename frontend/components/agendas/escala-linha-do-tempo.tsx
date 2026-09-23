"use client";

import { cn } from "@/lib/utils";
import type { TurnoEscala } from "@/lib/services/escala.service";

const MINUTOS_DIA = 24 * 60;

/** "HH:MM" de um minuto do dia; fora do dia ganha a marca do dia vizinho. */
export function rotuloMinuto(minuto: number): string {
  const noDia = ((minuto % MINUTOS_DIA) + MINUTOS_DIA) % MINUTOS_DIA;
  const hh = String(Math.floor(noDia / 60)).padStart(2, "0");
  const mm = String(noDia % 60).padStart(2, "0");
  if (minuto < 0) return `${hh}:${mm} (véspera)`;
  if (minuto >= MINUTOS_DIA) return `${hh}:${mm} (dia seguinte)`;
  return `${hh}:${mm}`;
}

/** Cores por especialidade, estáveis pelo nome — sem guardar nada no banco. */
const PALETA = [
  "bg-sky-500/85 border-sky-600",
  "bg-emerald-500/85 border-emerald-600",
  "bg-violet-500/85 border-violet-600",
  "bg-amber-500/85 border-amber-600",
  "bg-rose-500/85 border-rose-600",
  "bg-teal-500/85 border-teal-600",
];

function corDa(especialidade: string): string {
  let soma = 0;
  for (let i = 0; i < especialidade.length; i += 1) {
    soma += especialidade.charCodeAt(i);
  }
  return PALETA[soma % PALETA.length];
}

type Props = {
  turnos: TurnoEscala[];
  /** Minuto do dia para a linha de "agora"; nulo quando não é hoje. */
  agora: number | null;
  /** Admin clica na barra para registrar folga ou troca. */
  onClicarTurno?: (turno: TurnoEscala) => void;
};

/**
 * As 24 horas de um dia na horizontal, uma barra por pedaço de turno.
 *
 * Barra e não célula por hora: com célula, um turno de 8h vira oito caixas
 * repetidas e ninguém lê. Duas pessoas no mesmo horário ficam em linhas
 * separadas — a tela nunca assume uma pessoa por hora.
 */
export function EscalaLinhaDoTempo({ turnos, agora, onClicarTurno }: Props) {
  const horas = Array.from({ length: 25 }, (_, i) => i);
  const pos = (minuto: number) =>
    `${(Math.min(MINUTOS_DIA, Math.max(0, minuto)) / MINUTOS_DIA) * 100}%`;

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <div className="relative min-w-[760px] px-4 pb-4 pt-8">
        {/* Régua das horas. */}
        <div className="absolute inset-x-4 top-2 h-5">
          {horas.map((hora) => (
            <span
              key={hora}
              className={cn(
                "absolute -translate-x-1/2 text-[10px] tabular-nums text-muted-foreground",
                hora % 2 === 1 && "hidden md:inline",
              )}
              style={{ left: pos(hora * 60) }}
            >
              {String(hora).padStart(2, "0")}h
            </span>
          ))}
        </div>

        <div className="relative space-y-2">
          {/* Linhas de hora ao fundo. */}
          <div aria-hidden className="pointer-events-none absolute inset-0">
            {horas.map((hora) => (
              <span
                key={hora}
                className="absolute inset-y-0 w-px bg-border/60"
                style={{ left: pos(hora * 60) }}
              />
            ))}
            {agora !== null ? (
              <span
                className="absolute inset-y-[-8px] z-10 w-0.5 bg-rose-500"
                style={{ left: pos(agora) }}
                title={`Agora: ${rotuloMinuto(agora)}`}
              />
            ) : null}
          </div>

          {turnos.length === 0 ? (
            <p className="relative py-8 text-center text-sm text-muted-foreground">
              Ninguém escalado neste dia.
            </p>
          ) : (
            turnos.map((turno, indice) => {
              const clicavel = Boolean(onClicarTurno);
              const titulo =
                turno.origem === "FOLGA"
                  ? `Folga — ${turno.userName}`
                  : turno.origem === "TROCA"
                    ? `${turno.userName} (no lugar de ${turno.substituiu})`
                    : turno.userName;
              const periodo = `${rotuloMinuto(turno.inicio)} – ${rotuloMinuto(turno.fim)}`;
              return (
                <div key={`${turno.regraId}-${turno.inicio}-${indice}`} className="relative h-10">
                  <button
                    type="button"
                    disabled={!clicavel}
                    onClick={() => onClicarTurno?.(turno)}
                    title={`${titulo} · ${turno.specialtyName} · ${periodo}${
                      turno.motivo ? ` · ${turno.motivo}` : ""
                    }`}
                    className={cn(
                      "absolute inset-y-0 flex min-w-0 flex-col justify-center overflow-hidden rounded-md border px-2 text-left text-white shadow-sm",
                      "transition-[filter,transform] duration-150",
                      clicavel && "cursor-pointer hover:brightness-110 active:scale-[0.99]",
                      !clicavel && "cursor-default",
                      turno.origem === "FOLGA"
                        ? "border-dashed border-muted-foreground/50 bg-muted text-muted-foreground"
                        : corDa(turno.specialtyName),
                      turno.origem === "TROCA" && "border-2 border-dashed border-white/80",
                    )}
                    style={{
                      left: pos(turno.inicio),
                      width: `calc(${pos(turno.fim)} - ${pos(turno.inicio)})`,
                    }}
                  >
                    <span className="truncate text-xs font-semibold">{titulo}</span>
                    <span className="truncate text-[10px] opacity-90">
                      {turno.specialtyName} · {periodo}
                    </span>
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
