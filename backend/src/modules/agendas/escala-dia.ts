/**
 * Quem está de turno num dia — regra que se repete, com as exceções do dia.
 *
 * Tudo aqui é puro (sem banco, sem relógio) para ser testável: o serviço só
 * busca as regras e exceções e chama esta função.
 *
 * Convenções que o resto do módulo assume:
 * - Horário é "HH:MM". Fim menor ou igual ao início = o turno cruza a
 *   meia-noite e **pertence ao dia em que começa**. O turno das 22h às 6h de
 *   segunda é de segunda, mesmo que as 6h caiam na terça.
 * - Por isso, para desenhar a terça, também olhamos os turnos que começaram
 *   na segunda: a madrugada da terça é o fim deles.
 * - Minutos são contados a partir da meia-noite do dia pedido: -120 é 22h da
 *   véspera, 1440 é a meia-noite seguinte.
 */

export const MINUTOS_DIA = 24 * 60;

export type EscalaRegraDia = {
  id: string;
  userId: string;
  userName: string;
  specialtyName: string;
  startTime: string;
  endTime: string;
  /** 0 = domingo ... 6 = sábado. */
  daysOfWeek: number[];
  /** "YYYY-MM-DD". */
  validFrom: string;
  validTo: string | null;
};

export type EscalaExcecaoDia = {
  id: string;
  regraId: string;
  /** Dia em que o turno afetado começa. */
  date: string;
  tipo: 'FOLGA' | 'TROCA';
  substituteUserId: string | null;
  substituteName: string | null;
  /** Recorte do turno; nulos = turno inteiro. */
  startTime: string | null;
  endTime: string | null;
  motivo: string | null;
};

export type TurnoDia = {
  regraId: string;
  /** Preenchido quando este pedaço veio de uma troca. */
  excecaoId: string | null;
  userId: string;
  userName: string;
  specialtyName: string;
  /** Minutos a partir da meia-noite do dia pedido (pode ser negativo). */
  inicio: number;
  fim: number;
  /** Dia em que o turno começou — é nele que se faz a troca. */
  diaDoTurno: string;
  origem: 'REGRA' | 'TROCA';
  /** Nome de quem saiu, quando é troca. */
  substituiu: string | null;
  motivo: string | null;
};

export function paraMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((parte) => Number(parte));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
  return h * 60 + m;
}

/** "YYYY-MM-DD" ± n dias, sem passar por fuso horário. */
export function somarDias(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const data = new Date(Date.UTC(y, m - 1, d + n));
  return data.toISOString().slice(0, 10);
}

/** Dia da semana de "YYYY-MM-DD" (0 = domingo), sem fuso horário. */
export function diaDaSemana(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function regraValeNoDia(regra: EscalaRegraDia, ymd: string): boolean {
  if (ymd < regra.validFrom) return false;
  if (regra.validTo && ymd > regra.validTo) return false;
  return regra.daysOfWeek.includes(diaDaSemana(ymd));
}

/** Intervalo do turno em minutos a partir da meia-noite do dia em que começa. */
function intervaloDoTurno(
  startTime: string,
  endTime: string,
): { inicio: number; fim: number } {
  const inicio = paraMinutos(startTime);
  let fim = paraMinutos(endTime);
  // Fim antes (ou igual) do início: acaba no dia seguinte.
  if (fim <= inicio) fim += MINUTOS_DIA;
  return { inicio, fim };
}

/**
 * Coloca o recorte da exceção dentro do turno. Um recorte "02:00" num turno
 * que começou às 22h é o 2h da madrugada seguinte, não o 2h da véspera.
 */
function recorteNoTurno(
  turno: { inicio: number; fim: number },
  startTime: string | null,
  endTime: string | null,
): { inicio: number; fim: number } {
  if (!startTime || !endTime) return turno;
  let inicio = paraMinutos(startTime);
  let fim = paraMinutos(endTime);
  if (inicio < turno.inicio) inicio += MINUTOS_DIA;
  if (fim <= inicio) fim += MINUTOS_DIA;
  // Nunca sai do turno: recorte maior que o turno vira o turno inteiro.
  return {
    inicio: Math.max(inicio, turno.inicio),
    fim: Math.min(fim, turno.fim),
  };
}

/** O que sobra de [a, b) tirando [c, d). Zero, um ou dois pedaços. */
function subtrair(
  a: number,
  b: number,
  c: number,
  d: number,
): Array<{ inicio: number; fim: number }> {
  const partes: Array<{ inicio: number; fim: number }> = [];
  if (c > a) partes.push({ inicio: a, fim: Math.min(b, c) });
  if (d < b) partes.push({ inicio: Math.max(a, d), fim: b });
  return partes.filter((p) => p.fim > p.inicio);
}

export function turnosDoDia(
  dia: string,
  regras: EscalaRegraDia[],
  excecoes: EscalaExcecaoDia[],
): TurnoDia[] {
  const turnos: TurnoDia[] = [];

  // Véspera primeiro: a madrugada de hoje pode ser o fim de um turno de ontem.
  for (const [diaDoTurno, deslocamento] of [
    [somarDias(dia, -1), -MINUTOS_DIA],
    [dia, 0],
  ] as const) {
    for (const regra of regras) {
      if (!regraValeNoDia(regra, diaDoTurno)) continue;
      const base = intervaloDoTurno(regra.startTime, regra.endTime);
      if (!Number.isFinite(base.inicio) || !Number.isFinite(base.fim)) continue;

      const normal = (inicio: number, fim: number): TurnoDia => ({
        regraId: regra.id,
        excecaoId: null,
        userId: regra.userId,
        userName: regra.userName,
        specialtyName: regra.specialtyName,
        inicio: inicio + deslocamento,
        fim: fim + deslocamento,
        diaDoTurno,
        origem: 'REGRA',
        substituiu: null,
        motivo: null,
      });

      const excecao = excecoes.find(
        (e) => e.regraId === regra.id && e.date === diaDoTurno,
      );

      if (!excecao) {
        turnos.push(normal(base.inicio, base.fim));
        continue;
      }

      const recorte = recorteNoTurno(base, excecao.startTime, excecao.endTime);
      // Fora do recorte, o turno segue com quem é da regra.
      for (const resto of subtrair(base.inicio, base.fim, recorte.inicio, recorte.fim)) {
        turnos.push(normal(resto.inicio, resto.fim));
      }
      // Dentro do recorte: folga deixa vago; troca põe o substituto.
      if (excecao.tipo === 'TROCA' && excecao.substituteUserId) {
        turnos.push({
          regraId: regra.id,
          excecaoId: excecao.id,
          userId: excecao.substituteUserId,
          userName: excecao.substituteName ?? 'Substituto',
          specialtyName: regra.specialtyName,
          inicio: recorte.inicio + deslocamento,
          fim: recorte.fim + deslocamento,
          diaDoTurno,
          origem: 'TROCA',
          substituiu: regra.userName,
          motivo: excecao.motivo,
        });
      }
    }
  }

  // Só o que encosta no dia pedido. Um turno de ontem que acabou antes da
  // meia-noite não aparece hoje.
  return turnos
    .filter((t) => t.fim > 0 && t.inicio < MINUTOS_DIA)
    .sort((a, b) => a.inicio - b.inicio || a.userName.localeCompare(b.userName));
}

/** Quem está de turno num minuto do dia (ex.: agora). */
export function deTurnoEm(turnos: TurnoDia[], minuto: number): TurnoDia[] {
  return turnos.filter((t) => t.inicio <= minuto && minuto < t.fim);
}
