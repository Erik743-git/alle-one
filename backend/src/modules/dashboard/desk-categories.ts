/**
 * Mesas dos gráficos do dashboard.
 *
 * Antes daqui saíam 5 categorias fixas (Infraestrutura, Sistema, NOC,
 * Rotinas, Consult) adivinhadas por palavra-chave no nome da mesa e no
 * título do chamado. Toda mesa que não batesse em nenhuma palavra caía no
 * "senão" e virava Sistema — foi assim que as horas de Projetos ficaram
 * escondidas dentro de Sistema, e o mesmo valia para Alleone, Triagem e
 * Protheus/BI - Fluidra.
 *
 * Agora a série do gráfico é o nome da mesa como está no chamado. Mesa
 * nova passa a aparecer sozinha, sem mexer em código.
 */

/** Mesa usada quando o chamado não tem nenhuma. */
export const SEM_MESA = 'Sem mesa';

/** Campos fixos da linha; o resto das chaves são nomes de mesa. */
export type MonthlyRowBase = {
  monthKey: string;
  monthLabel: string;
  Total: number;
};

/**
 * Uma linha por mês: os campos fixos mais uma chave por mesa.
 * Ex.: `{ monthKey, monthLabel, Total: 12, Projetos: 5, NOC: 7 }`.
 */
export type MonthlyDeskBreakdownRow = MonthlyRowBase & {
  [deskName: string]: string | number;
};

/** Nomes que a linha usa para si e que, por isso, não valem como mesa. */
const CAMPOS_RESERVADOS = new Set(['monthKey', 'monthLabel', 'Total']);

export function isReservedRowField(key: string): boolean {
  return CAMPOS_RESERVADOS.has(key);
}

/** Normaliza o nome da mesa vindo do banco/API. */
export function normalizeDeskName(value: unknown): string {
  const nome = String(value ?? '').trim();
  if (!nome || isReservedRowField(nome)) return SEM_MESA;
  return nome;
}

/** Nome da mesa de um chamado da API (o nome vem dentro de `desk`). */
export function getDeskNameFromTicket(ticket: Record<string, unknown>): string {
  const desk = ticket.desk;
  const nome =
    typeof desk === 'object' && desk && 'name' in desk
      ? (desk as { name?: unknown }).name
      : null;
  return normalizeDeskName(nome);
}

/** Expressão SQL do nome da mesa, igual ao que `normalizeDeskName` faz. */
export function sqlDeskNameExpression(alias: string): string {
  return `coalesce(nullif(trim(${alias}.desk_name), ''), '${SEM_MESA}')`;
}

/** Soma o valor na mesa da linha, criando a chave na primeira vez. */
export function addToDesk(
  row: MonthlyDeskBreakdownRow,
  deskName: string,
  value: number,
): void {
  const mesa = normalizeDeskName(deskName);
  const atual = typeof row[mesa] === 'number' ? (row[mesa] as number) : 0;
  row[mesa] = atual + value;
  row.Total += value;
}

/**
 * Garante que toda linha tenha as mesmas mesas (zero onde não houve
 * movimento). Sem isso o gráfico fica com buracos nos meses em que a mesa
 * não teve nenhum chamado.
 */
export function fillMissingDesks(
  rows: MonthlyDeskBreakdownRow[],
  deskNames: Iterable<string>,
): void {
  const mesas = Array.from(deskNames);
  for (const row of rows) {
    for (const mesa of mesas) {
      if (typeof row[mesa] !== 'number') row[mesa] = 0;
    }
  }
}

/** Mesas presentes nas linhas, da que mais aparece para a que menos. */
export function deskNamesFromRows(
  rows: MonthlyDeskBreakdownRow[],
): string[] {
  const totais = new Map<string, number>();
  for (const row of rows) {
    for (const [chave, valor] of Object.entries(row)) {
      if (isReservedRowField(chave) || typeof valor !== 'number') continue;
      totais.set(chave, (totais.get(chave) ?? 0) + valor);
    }
  }
  return Array.from(totais.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
    .map(([mesa]) => mesa);
}
