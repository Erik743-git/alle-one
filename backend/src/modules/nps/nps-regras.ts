/**
 * Regras do NPS e do pop-up de satisfação, sem banco (testáveis).
 * Desenho: docs/desenho/AVALIACAO-E-NPS.md.
 */

/** Nota igual ou abaixo disto avisa os admins (0 a 6 são detratores). */
export const NPS_NOTA_ALERTA_MAXIMA = 6;
/** Pesquisa (NPS ou avaliação) mais velha que isto não vira pop-up. */
export const DIAS_JANELA_POPUP = 30;
/** Depois de responder, a pessoa ainda pode trocar a nota por este tempo. */
export const HORAS_PARA_TROCAR_NPS = 24;
export const NPS_INTERVALO_PADRAO = 3;
export const NPS_INTERVALO_MAXIMO = 24;

export type Classe = 'PROMOTOR' | 'NEUTRO' | 'DETRATOR';

export function classe(nota: number): Classe {
  if (nota >= 9) return 'PROMOTOR';
  if (nota >= 7) return 'NEUTRO';
  return 'DETRATOR';
}

/**
 * NPS canônico: % promotores (9–10) menos % detratores (0–6). Neutros contam
 * no total. Vai de −100 a +100; sem respostas, null.
 */
export function calcularNps(notas: number[]): number | null {
  if (!notas.length) return null;
  let p = 0;
  let d = 0;
  for (const n of notas) {
    const c = classe(n);
    if (c === 'PROMOTOR') p += 1;
    else if (c === 'DETRATOR') d += 1;
  }
  return Math.round(((p - d) / notas.length) * 100);
}

/** "2026-T3" no fuso de Brasília (UTC−3). */
export function trimestre(instante: Date): string {
  const local = new Date(instante.getTime() - 3 * 3_600_000);
  const t = Math.floor(local.getUTCMonth() / 3) + 1;
  return `${local.getUTCFullYear()}-T${t}`;
}

/** Soma meses de calendário (31/01 + 1 mês = 28 ou 29/02). */
export function somarMeses(data: Date, meses: number): Date {
  const r = new Date(data.getTime());
  const dia = r.getUTCDate();
  r.setUTCDate(1);
  r.setUTCMonth(r.getUTCMonth() + meses);
  const ultimo = new Date(
    Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0),
  ).getUTCDate();
  r.setUTCDate(Math.min(dia, ultimo));
  return r;
}

/** Já passou o intervalo desde o último envio para esta pessoa? */
export function deveEnviar(
  ultimoEnvio: Date | null,
  intervaloMeses: number,
  agora: Date,
): boolean {
  if (!ultimoEnvio) return true;
  return somarMeses(ultimoEnvio, intervaloMeses).getTime() <= agora.getTime();
}

export function podeTrocarNota(
  respondidaEm: Date | null,
  agora: Date,
): boolean {
  if (!respondidaEm) return true;
  return (
    agora.getTime() - respondidaEm.getTime() < HORAS_PARA_TROCAR_NPS * 3_600_000
  );
}

/** Dia (AAAA-MM-DD) em Brasília: o limite "um pop-up por dia" vira à meia-noite local. */
export function diaBrasilia(instante: Date): string {
  return new Date(instante.getTime() - 3 * 3_600_000)
    .toISOString()
    .slice(0, 10);
}

export function jaMostrouHoje(ultimoEm: Date | null, agora: Date): boolean {
  return !!ultimoEm && diaBrasilia(ultimoEm) === diaBrasilia(agora);
}

export function inicioJanelaPopup(agora: Date): Date {
  return new Date(agora.getTime() - DIAS_JANELA_POPUP * 86_400_000);
}
