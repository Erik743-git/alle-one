/**
 * Regras do quadro de oportunidades, puras (sem banco, sem relógio) para
 * serem testáveis. O serviço busca o card e chama estas funções.
 * Desenho aprovado: docs/desenho/OPORTUNIDADES.md.
 */
import type {
  OportunidadeEstagio,
  OportunidadeMotivoReprova,
  OportunidadeTipo,
} from '@prisma/client';

export const DIA_MS = 24 * 60 * 60 * 1000;
/** Aprovado ou Reprovado há 2 dias corridos: vai sozinho para Fechado. */
export const DIAS_PARA_FECHAR = 2;
/** Pendente há 15 dias: alerta ao comercial. */
export const DIAS_PENDENTE_ALERTA = 15;
/** Sem nenhuma alteração há 30 dias: alerta ao comercial. */
export const DIAS_PARADO_ALERTA = 30;
/** O alerta se repete uma vez por semana até alguém agir. */
export const DIAS_ENTRE_ALERTAS = 7;

export const ORDEM_ESTAGIOS: OportunidadeEstagio[] = [
  'PENDENTE',
  'EM_ANALISE',
  'PROPOSTA',
  'AGUARDO_CLIENTE',
  'APROVADO',
  'REPROVADO',
  'FECHADO',
];

export const ROTULO_ESTAGIO: Record<OportunidadeEstagio, string> = {
  PENDENTE: 'Pendente',
  EM_ANALISE: 'Em análise',
  PROPOSTA: 'Proposta em elaboração',
  AGUARDO_CLIENTE: 'Aguardo cliente/Enviado',
  APROVADO: 'Aprovado',
  REPROVADO: 'Reprovado',
  FECHADO: 'Fechado',
};

/** Colunas em que o card ainda está "andando" (entram nos alertas). */
const EM_ANDAMENTO: OportunidadeEstagio[] = [
  'PENDENTE',
  'EM_ANALISE',
  'PROPOSTA',
  'AGUARDO_CLIENTE',
];

export type MovimentoInput = {
  atual: OportunidadeEstagio;
  para: OportunidadeEstagio;
  /** Tipo já gravado no card ou enviado junto com o movimento. */
  tipo: OportunidadeTipo | null;
  motivoReprova: OportunidadeMotivoReprova | null;
  motivoReprovaTexto: string | null;
};

/** Por que o movimento não vale, ou null se vale. */
export function problemaNoMovimento(m: MovimentoInput): string | null {
  if (m.atual === m.para) return 'O card já está nessa coluna.';
  if (m.atual === 'FECHADO') {
    return 'Card fechado: use "Reabrir" para trazê-lo de volta.';
  }
  if (m.para === 'PENDENTE') {
    return 'Depois de sair de Pendente, o card não volta para lá.';
  }
  if (
    m.para === 'FECHADO' &&
    m.atual !== 'APROVADO' &&
    m.atual !== 'REPROVADO'
  ) {
    return 'Só dá para fechar um card aprovado ou reprovado.';
  }
  if (m.atual === 'PENDENTE' && !m.tipo) {
    return 'Escolha o tipo da oportunidade antes de tirar de Pendente.';
  }
  if (m.para === 'REPROVADO') {
    if (!m.motivoReprova) return 'Informe o motivo da reprovação.';
    if (m.motivoReprova === 'OUTRO' && !m.motivoReprovaTexto?.trim()) {
      return 'Descreva o motivo da reprovação.';
    }
  }
  return null;
}

/** Aprovado/Reprovado há 2 dias corridos. */
export function deveFecharSozinho(
  card: { estagio: OportunidadeEstagio; estagioDesde: Date },
  agora: Date,
): boolean {
  if (card.estagio !== 'APROVADO' && card.estagio !== 'REPROVADO') return false;
  return (
    agora.getTime() - card.estagioDesde.getTime() >= DIAS_PARA_FECHAR * DIA_MS
  );
}

export type MotivoAlerta = 'PENDENTE_15_DIAS' | 'PARADO_30_DIAS';

/**
 * Motivo do alerta ao comercial, ou null. Respeita o intervalo semanal
 * desde o último alerta enviado.
 */
export function motivoDoAlerta(
  card: {
    estagio: OportunidadeEstagio;
    estagioDesde: Date;
    ultimaMovimentacao: Date;
    alertaEnviadoEm: Date | null;
  },
  agora: Date,
): MotivoAlerta | null {
  if (!EM_ANDAMENTO.includes(card.estagio)) return null;
  if (
    card.alertaEnviadoEm &&
    agora.getTime() - card.alertaEnviadoEm.getTime() <
      DIAS_ENTRE_ALERTAS * DIA_MS
  ) {
    return null;
  }
  if (
    card.estagio === 'PENDENTE' &&
    agora.getTime() - card.estagioDesde.getTime() >=
      DIAS_PENDENTE_ALERTA * DIA_MS
  ) {
    return 'PENDENTE_15_DIAS';
  }
  if (
    agora.getTime() - card.ultimaMovimentacao.getTime() >=
    DIAS_PARADO_ALERTA * DIA_MS
  ) {
    return 'PARADO_30_DIAS';
  }
  return null;
}

/** Para onde a reabertura leva o card. */
export function colunaDaReabertura(
  estagioAnterior: OportunidadeEstagio | null,
): OportunidadeEstagio {
  return estagioAnterior === 'REPROVADO' ? 'REPROVADO' : 'APROVADO';
}

/** Ano civil do instante, em Brasília: início e fim (exclusivo). */
export function anoCivil(agora: Date): { inicio: Date; fim: Date } {
  // Brasília é UTC-3 o ano todo desde 2019.
  const ano = new Date(agora.getTime() - 3 * 60 * 60 * 1000).getUTCFullYear();
  return {
    inicio: new Date(Date.UTC(ano, 0, 1, 3)),
    fim: new Date(Date.UTC(ano + 1, 0, 1, 3)),
  };
}
