/**
 * Janelas de manutenção x GMUDs.
 *
 * Tudo aqui é puro (sem banco, sem relógio) para ser testável: o serviço só
 * busca janelas e GMUDs e chama estas funções.
 *
 * A janela é combinada em horário de parede de Brasília ("toda terça, das
 * 22h às 06h"); a GMUD é gravada em instante (UTC). A comparação é sempre em
 * instantes: a janela é convertida, dia a dia, para UTC.
 */
import { MINUTOS_DIA, diaDaSemana, paraMinutos, somarDias } from './escala-dia';

export const FUSO_MANUTENCAO = 'America/Sao_Paulo';

export type Intervalo = { inicio: Date; fim: Date };

export type JanelaDef = {
  recorrente: boolean;
  /** Recorrente: 0 = domingo ... 6 = sábado. */
  daysOfWeek: number[];
  /** Recorrente: "HH:MM". Fim menor ou igual ao início cruza a meia-noite. */
  startTime: string | null;
  endTime: string | null;
  /** Recorrente: "YYYY-MM-DD"; nulo = sem limite. */
  validFrom: string | null;
  validTo: string | null;
  /** Avulsa. */
  inicio: Date | null;
  fim: Date | null;
};

/**
 * - DENTRO: todo trecho da GMUD cabe em alguma janela da empresa.
 * - FORA: algum pedaço fica fora de todas. Só aviso: não bloqueia a GMUD.
 * - SEM_JANELA: a empresa não tem janela cadastrada; não há o que comparar.
 */
export type SituacaoGmud = 'DENTRO' | 'FORA' | 'SEM_JANELA';

const FORMATO_PARTES = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSO_MANUTENCAO,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Diferença do fuso para o UTC num instante, em minutos (Brasília: -180). */
function deslocamentoMin(instante: Date): number {
  const partes = FORMATO_PARTES.formatToParts(instante);
  const valor = (tipo: string) =>
    Number(partes.find((p) => p.type === tipo)?.value ?? NaN);
  const comoUtc = Date.UTC(
    valor('year'),
    valor('month') - 1,
    valor('day'),
    valor('hour'),
    valor('minute'),
    valor('second'),
  );
  return Math.round((comoUtc - instante.getTime()) / 60_000);
}

/**
 * Instante de "YYYY-MM-DD" + minutos desde a meia-noite, em Brasília.
 * Minutos acima de 1440 caem no dia seguinte (turno que cruza a meia-noite).
 */
export function horaLocal(ymd: string, minutos: number): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  const ingenuo = Date.UTC(y, m - 1, d, 0, minutos);
  // Segunda passada acerta o dia da virada, se o horário de verão voltar.
  let t = ingenuo - deslocamentoMin(new Date(ingenuo)) * 60_000;
  t = ingenuo - deslocamentoMin(new Date(t)) * 60_000;
  return new Date(t);
}

/** Dia ("YYYY-MM-DD") de um instante, em Brasília. */
export function diaLocal(instante: Date): string {
  const partes = FORMATO_PARTES.formatToParts(instante);
  const valor = (tipo: string) =>
    partes.find((p) => p.type === tipo)?.value ?? '';
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

/**
 * Onde a janela vale entre os dias `de` e `ate` (inclusive).
 *
 * Uma recorrente que começa na véspera de `de` e cruza a meia-noite entra
 * também: é ela que cobre a madrugada de `de`.
 */
export function intervalosDaJanela(
  janela: JanelaDef,
  de: string,
  ate: string,
): Intervalo[] {
  if (!janela.recorrente) {
    if (!janela.inicio || !janela.fim) return [];
    return [{ inicio: janela.inicio, fim: janela.fim }];
  }
  if (!janela.startTime || !janela.endTime) return [];
  const inicio = paraMinutos(janela.startTime);
  let fim = paraMinutos(janela.endTime);
  if (fim <= inicio) fim += MINUTOS_DIA;

  const saida: Intervalo[] = [];
  for (let dia = somarDias(de, -1); dia <= ate; dia = somarDias(dia, 1)) {
    if (janela.validFrom && dia < janela.validFrom) continue;
    if (janela.validTo && dia > janela.validTo) continue;
    if (!janela.daysOfWeek.includes(diaDaSemana(dia))) continue;
    saida.push({ inicio: horaLocal(dia, inicio), fim: horaLocal(dia, fim) });
  }
  return saida;
}

/** Junta intervalos que se tocam ou se sobrepõem (22h–24h + 00h–06h = um só). */
export function unirIntervalos(intervalos: Intervalo[]): Intervalo[] {
  const ordenados = [...intervalos]
    .filter((i) => i.fim > i.inicio)
    .sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  const saida: Intervalo[] = [];
  for (const atual of ordenados) {
    const ultimo = saida[saida.length - 1];
    if (ultimo && atual.inicio <= ultimo.fim) {
      if (atual.fim > ultimo.fim) ultimo.fim = atual.fim;
    } else {
      saida.push({ inicio: atual.inicio, fim: atual.fim });
    }
  }
  return saida;
}

/** Pedaços de `trecho` que não caem em nenhuma das janelas. */
export function foraDasJanelas(
  trecho: Intervalo,
  janelas: Intervalo[],
): Intervalo[] {
  const fora: Intervalo[] = [];
  let cursor = trecho.inicio;
  for (const janela of unirIntervalos(janelas)) {
    if (janela.fim <= cursor) continue;
    if (janela.inicio >= trecho.fim) break;
    if (janela.inicio > cursor)
      fora.push({ inicio: cursor, fim: janela.inicio });
    if (janela.fim > cursor) cursor = janela.fim;
    if (cursor >= trecho.fim) break;
  }
  if (cursor < trecho.fim) fora.push({ inicio: cursor, fim: trecho.fim });
  return fora;
}

/**
 * Situação da GMUD perante as janelas da empresa dela.
 *
 * `janelas` são as ocorrências já expandidas (intervalosDaJanela) nos dias
 * que os trechos cobrem. `empresaTemJanela` separa "fora de tudo" de "não há
 * janela nenhuma cadastrada" — o segundo não é aviso, é falta de cadastro.
 */
export function situacaoDaGmud(
  trechos: Intervalo[],
  janelas: Intervalo[],
  empresaTemJanela: boolean,
): { situacao: SituacaoGmud; fora: Intervalo[] } {
  if (!empresaTemJanela) return { situacao: 'SEM_JANELA', fora: [] };
  const fora = unirIntervalos(
    trechos.flatMap((trecho) => foraDasJanelas(trecho, janelas)),
  );
  return { situacao: fora.length > 0 ? 'FORA' : 'DENTRO', fora };
}

/**
 * Dias ("YYYY-MM-DD", Brasília) que os trechos tocam, para saber quais
 * ocorrências de janela buscar. Vazio quando não há trecho.
 */
export function diasDosTrechos(
  trechos: Intervalo[],
): { de: string; ate: string } | null {
  if (trechos.length === 0) return null;
  let menor = trechos[0].inicio;
  let maior = trechos[0].fim;
  for (const t of trechos) {
    if (t.inicio < menor) menor = t.inicio;
    if (t.fim > maior) maior = t.fim;
  }
  return { de: diaLocal(menor), ate: diaLocal(maior) };
}
