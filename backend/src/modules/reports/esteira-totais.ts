import {
  appointmentToInterval,
  unionIntervalMinutes,
} from '../rendimento/rendimento-worked-minutes.helper';

/** Evento de HE/plantão da esteira de aprovação (rendimento_day_events). */
export type EventoEsteira = {
  dateRef: string;
  eventType: 'OVERTIME' | 'PLANTAO' | string;
  status: 'APPROVED' | 'REJECTED' | 'PENDING' | 'ACTIVE' | string;
  fromTime: string | null;
  toTime: string | null;
  minutes: number;
};

export type TotaisEsteira = {
  extraAprovada: number;
  extraPendente: number;
  extraNegada: number;
  plantaoAprovado: number;
  plantaoPendente: number;
  plantaoNegado: number;
};

type Chave = keyof TotaisEsteira;

function chaveDo(e: EventoEsteira): Chave {
  const plantao = e.eventType === 'PLANTAO';
  if (e.status === 'APPROVED')
    return plantao ? 'plantaoAprovado' : 'extraAprovada';
  if (e.status === 'REJECTED') return plantao ? 'plantaoNegado' : 'extraNegada';
  return plantao ? 'plantaoPendente' : 'extraPendente';
}

/**
 * Soma a esteira por situação (aprovada, pendente, negada) sem contar duas
 * vezes o mesmo minuto: dentro de cada dia, horários que se sobrepõem entram
 * uma vez só. É o número que o RH paga — antes a soma era apontamento por
 * apontamento e um bloco de 12:00–23:59 somado a outros dentro dele dava
 * mais hora aprovada do que a hora extra lançada.
 *
 * Evento sem horário (não deveria acontecer em HE/plantão) entra pelos
 * minutos, somado à parte.
 */
export function somarEsteira(eventos: EventoEsteira[]): TotaisEsteira {
  const totais: TotaisEsteira = {
    extraAprovada: 0,
    extraPendente: 0,
    extraNegada: 0,
    plantaoAprovado: 0,
    plantaoPendente: 0,
    plantaoNegado: 0,
  };
  const porGrupo = new Map<string, Array<{ start: number; end: number }>>();
  for (const e of eventos) {
    const chave = chaveDo(e);
    const intervalo = appointmentToInterval(e.fromTime, e.toTime, e.minutes);
    if (!intervalo) {
      // Início = fim (comunicação) conta 0; sem horário, conta os minutos.
      if (!e.fromTime) totais[chave] += Math.max(0, Math.trunc(e.minutes || 0));
      continue;
    }
    const grupo = `${chave}|${e.dateRef.slice(0, 10)}`;
    const lista = porGrupo.get(grupo) ?? [];
    lista.push(intervalo);
    porGrupo.set(grupo, lista);
  }
  for (const [grupo, lista] of porGrupo) {
    const chave = grupo.split('|')[0] as Chave;
    totais[chave] += unionIntervalMinutes(lista);
  }
  return totais;
}
