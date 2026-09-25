/** Carga da equipe (Apontamentos → Carga da equipe), sem banco. */
import {
  appointmentToInterval,
  unionIntervalMinutes,
} from '../rendimento/rendimento-worked-minutes.helper';

/** Chamado sem movimento há mais que isto conta como parado (igual ao Correio). */
export const HORAS_PARADO = 48;

const MS_DIA = 86_400_000;

function diaBrasilia(instante: Date): string {
  return new Date(instante.getTime() - 3 * 3_600_000)
    .toISOString()
    .slice(0, 10);
}

/**
 * Semana corrente (segunda a domingo, Brasília) e quantos dias úteis dela já
 * começaram, contando hoje: é contra isso que a jornada é comparada.
 */
export function semanaAtual(agora: Date): {
  inicio: string;
  fim: string;
  diasUteisAteHoje: number;
} {
  const hoje = diaBrasilia(agora);
  const d = new Date(`${hoje}T12:00:00Z`);
  const dow = d.getUTCDay(); // 0 = domingo
  const desdeSegunda = (dow + 6) % 7;
  const seg = new Date(d.getTime() - desdeSegunda * MS_DIA);
  const dom = new Date(seg.getTime() + 6 * MS_DIA);
  return {
    inicio: seg.toISOString().slice(0, 10),
    fim: dom.toISOString().slice(0, 10),
    diasUteisAteHoje: Math.min(5, desdeSegunda + 1),
  };
}

export type ApontamentoCarga = {
  data: string;
  inicio: string | null;
  fim: string | null;
};

/** Minutos trabalhados, dia a dia, sem contar duas vezes o que se sobrepõe. */
export function minutosTrabalhados(apontamentos: ApontamentoCarga[]): number {
  const porDia = new Map<string, Array<{ start: number; end: number }>>();
  for (const a of apontamentos) {
    const i = appointmentToInterval(a.inicio, a.fim, 0);
    if (!i) continue;
    porDia.set(a.data, [...(porDia.get(a.data) ?? []), i]);
  }
  let total = 0;
  for (const lista of porDia.values()) total += unionIntervalMinutes(lista);
  return total;
}

export function estaParado(ultimoMovimento: Date | null, agora: Date): boolean {
  if (!ultimoMovimento) return false;
  return agora.getTime() - ultimoMovimento.getTime() > HORAS_PARADO * 3_600_000;
}
