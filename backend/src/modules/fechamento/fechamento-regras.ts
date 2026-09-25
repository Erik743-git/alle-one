/**
 * Fechamento do ciclo de horas (26 → 25), sem banco. Desenho: aba
 * "Fechamento" de Apontamentos (docs/desenho/FECHAMENTO-E-CARGA.md).
 */
import { appointmentToInterval } from '../rendimento/rendimento-worked-minutes.helper';
import { overtimeKindFromValorization } from '../rendimento/rendimento-day-insights';

/** Chave do ciclo: mês (AAAA-MM) em que ele termina, no dia 25. */
export type Ciclo = string;

const RE_CICLO = /^(\d{4})-(0[1-9]|1[0-2])$/;
const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;

export function cicloValido(ciclo: string): boolean {
  return RE_CICLO.test(ciclo);
}

function ymd(ano: number, mes0: number, dia: number): string {
  const d = new Date(Date.UTC(ano, mes0, dia));
  return d.toISOString().slice(0, 10);
}

/** Primeiro (26 do mês anterior) e último (25) dia do ciclo. */
export function limitesDoCiclo(ciclo: Ciclo): { inicio: string; fim: string } {
  const m = RE_CICLO.exec(ciclo);
  if (!m) throw new Error(`Ciclo inválido: ${ciclo}`);
  const ano = Number(m[1]);
  const mes0 = Number(m[2]) - 1;
  return { inicio: ymd(ano, mes0 - 1, 26), fim: ymd(ano, mes0, 25) };
}

/** Ciclo que contém o dia AAAA-MM-DD (26 em diante já é o ciclo seguinte). */
export function cicloDoDia(dia: string): Ciclo {
  if (!RE_DIA.test(dia)) throw new Error(`Data inválida: ${dia}`);
  const [a, m, d] = dia.split('-').map(Number);
  const fimNoMes =
    d >= 26 ? new Date(Date.UTC(a, m, 1)) : new Date(Date.UTC(a, m - 1, 1));
  return fimNoMes.toISOString().slice(0, 7);
}

export function cicloAnterior(ciclo: Ciclo): Ciclo {
  const { inicio } = limitesDoCiclo(ciclo);
  return cicloDoDia(inicio.replace(/-26$/, '-25'));
}

/** Só fecha ciclo que já terminou (o dia 25 ficou para trás). */
export function cicloEncerrado(ciclo: Ciclo, hoje: string): boolean {
  return limitesDoCiclo(ciclo).fim < hoje;
}

/** Dia AAAA-MM-DD no fuso de Brasília. */
export function diaBrasilia(instante: Date): string {
  return new Date(instante.getTime() - 3 * 3_600_000)
    .toISOString()
    .slice(0, 10);
}

// ------------------------------------------------------------ conferência

export const MINUTOS_DIA_LONGO = 12 * 60;

export type ApontamentoConferencia = {
  id: string;
  userId: string;
  nome: string;
  ticketNumber: number;
  data: string;
  inicio: string | null;
  fim: string | null;
  servico: string | null;
  criadoEm: Date;
};

export type TipoAchado =
  | 'SOBREPOSICAO'
  | 'DIA_LONGO'
  | 'FIM_DE_SEMANA'
  | 'LANCADO_DEPOIS';

export type Achado = {
  tipo: TipoAchado;
  userId: string;
  nome: string;
  data: string;
  /** Texto curto para a tela. */
  detalhe: string;
  chamados: number[];
  apontamentos: string[];
};

function hhmm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${String(m).padStart(2, '0')}`;
}

function diaDaSemana(dia: string): number {
  return new Date(`${dia}T12:00:00Z`).getUTCDay();
}

/**
 * Lista o que o admin deve conferir antes de fechar. Comunicação (início
 * igual ao fim) não conta hora, então fica fora de tudo.
 */
export function conferir(apontamentos: ApontamentoConferencia[]): Achado[] {
  const achados: Achado[] = [];
  const porPessoaDia = new Map<
    string,
    Array<ApontamentoConferencia & { ini: number; fimMin: number }>
  >();

  for (const a of apontamentos) {
    const intervalo = appointmentToInterval(a.inicio, a.fim, 0);
    if (!intervalo) continue;
    const chave = `${a.userId}|${a.data}`;
    const lista = porPessoaDia.get(chave) ?? [];
    lista.push({ ...a, ini: intervalo.start, fimMin: intervalo.end });
    porPessoaDia.set(chave, lista);

    const dow = diaDaSemana(a.data);
    if (
      (dow === 0 || dow === 6) &&
      overtimeKindFromValorization({ name: a.servico ?? '' }) !== 'PLANTAO'
    ) {
      achados.push({
        tipo: 'FIM_DE_SEMANA',
        userId: a.userId,
        nome: a.nome,
        data: a.data,
        detalhe: `${dow === 6 ? 'Sábado' : 'Domingo'}, ${a.inicio}–${a.fim}, lançado como ${a.servico || 'hora normal'}`,
        chamados: [a.ticketNumber],
        apontamentos: [a.id],
      });
    }

    const lancadoEm = diaBrasilia(a.criadoEm);
    if (lancadoEm > a.data) {
      const dias = Math.round(
        (Date.parse(`${lancadoEm}T00:00:00Z`) -
          Date.parse(`${a.data}T00:00:00Z`)) /
          86_400_000,
      );
      achados.push({
        tipo: 'LANCADO_DEPOIS',
        userId: a.userId,
        nome: a.nome,
        data: a.data,
        detalhe: `Lançado ${dias} dia${dias > 1 ? 's' : ''} depois (em ${lancadoEm.split('-').reverse().join('/')})`,
        chamados: [a.ticketNumber],
        apontamentos: [a.id],
      });
    }
  }

  for (const lista of porPessoaDia.values()) {
    lista.sort((x, y) => x.ini - y.ini);
    // Sobreposição: cada par que se cruza, uma vez.
    for (let i = 0; i < lista.length; i++) {
      for (let j = i + 1; j < lista.length; j++) {
        if (lista[j].ini >= lista[i].fimMin) break;
        const a = lista[i];
        const b = lista[j];
        achados.push({
          tipo: 'SOBREPOSICAO',
          userId: a.userId,
          nome: a.nome,
          data: a.data,
          detalhe:
            a.ticketNumber === b.ticketNumber
              ? `${a.inicio}–${a.fim} e ${b.inicio}–${b.fim} no mesmo chamado`
              : `#${a.ticketNumber} ${a.inicio}–${a.fim} cruza com #${b.ticketNumber} ${b.inicio}–${b.fim}`,
          chamados: [...new Set([a.ticketNumber, b.ticketNumber])],
          apontamentos: [a.id, b.id],
        });
      }
    }
    // Dia longo: soma sem contar duas vezes o que se sobrepõe.
    let total = 0;
    let corte = -1;
    for (const a of lista) {
      const ini = Math.max(a.ini, corte);
      if (a.fimMin > ini) total += a.fimMin - ini;
      corte = Math.max(corte, a.fimMin);
    }
    if (total > MINUTOS_DIA_LONGO) {
      const a = lista[0];
      achados.push({
        tipo: 'DIA_LONGO',
        userId: a.userId,
        nome: a.nome,
        data: a.data,
        detalhe: `${hhmm(total)} lançadas no dia`,
        chamados: [...new Set(lista.map((x) => x.ticketNumber))],
        apontamentos: lista.map((x) => x.id),
      });
    }
  }

  const ordem: Record<TipoAchado, number> = {
    SOBREPOSICAO: 0,
    DIA_LONGO: 1,
    FIM_DE_SEMANA: 2,
    LANCADO_DEPOIS: 3,
  };
  return achados.sort(
    (x, y) =>
      ordem[x.tipo] - ordem[y.tipo] ||
      x.nome.localeCompare(y.nome) ||
      x.data.localeCompare(y.data),
  );
}
