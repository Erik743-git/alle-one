/**
 * Regras das duas abas de admin em Apontamentos: "Chamados parados" e
 * "Chamados por responsável". Sem banco, para dar para testar.
 *
 * Combinado com o Erik em 25/09 (docs/desenho/APONTAMENTOS-TELAS-ADMIN.md).
 */

/**
 * Eventos do histórico que contam como alguém ter mexido no chamado:
 * apontamento, comunicação, troca de estágio ou de responsável, e fechar ou
 * reabrir. Abrir o chamado (TICKET_CREATED, PRE_TICKET_CREATED) não conta,
 * nem a resposta do cliente por e-mail (EMAIL_REPLY) — é o cliente, não a
 * equipe.
 */
export const EVENTOS_QUE_MEXEM = [
  'STAGE_CHANGED',
  'RESPONSIBLE_CHANGED',
  'APPOINTMENT_CREATED',
  'APPOINTMENT_UPDATED',
  'APPOINTMENT_DELETED',
  'APPOINTMENT_TIFLUX',
  'COMMUNICATION_REMOVED',
  'TICKET_CLOSED',
  'TICKET_REOPENED',
] as const;

/**
 * Janela em que um evento é atribuído a uma regra de automação: a regra roda
 * no mesmo pedido que muda o chamado, então o registro em
 * ticket_automation_runs fica colado no evento. "Evento automático não conta."
 */
export const JANELA_AUTOMACAO_SEGUNDOS = 60;

/** Acima disto o chamado fica destacado e tem filtro próprio (horas corridas). */
export const LIMITE_HORAS_PARADO = 48;

export const SEM_RESPONSAVEL = 'Sem responsável';
export const SEM_EMPRESA = 'Sem empresa';

/** Chave de grupo para quem não tem responsável ou empresa. */
export const CHAVE_SEM = 'sem';

export type Visao = 'empresa' | 'responsavel';

export function lerVisao(valor: string | undefined): Visao {
  return valor === 'responsavel' ? 'responsavel' : 'empresa';
}

/**
 * Chamado de rotina fica fora dos parados. Três sinais, porque as rotinas
 * vieram de dois lugares: as do portal são abertas pelo usuário técnico da
 * automação; as antigas do TiFlux entraram como "Recurrent activity" ou só com
 * "[ROTINAS]" no título (a forma de abertura veio vazia em várias).
 */
export function ehRotina(params: {
  criadoPor: string | null;
  formaAbertura: string | null;
  titulo: string | null;
  automacaoId: string | null;
}): boolean {
  if (params.automacaoId && params.criadoPor === params.automacaoId) {
    return true;
  }
  if (
    (params.formaAbertura ?? '').trim().toLowerCase() === 'recurrent activity'
  ) {
    return true;
  }
  return (params.titulo ?? '').trim().toUpperCase().startsWith('[ROTINAS]');
}

/** Horas corridas desde a abertura, para baixo (47h59 ainda é 47). */
export function horasParado(abertoEm: Date, agora: Date): number {
  const ms = agora.getTime() - abertoEm.getTime();
  return ms > 0 ? Math.floor(ms / 3_600_000) : 0;
}

export type ChamadoParado = {
  ticketNumber: number;
  titulo: string | null;
  empresaChave: string;
  empresa: string;
  responsavelChave: string;
  responsavel: string;
  abertoEm: string;
  horasParado: number;
  mais48h: boolean;
  semResponsavel: boolean;
};

export function montarChamadoParado(
  row: {
    ticket_number: number;
    title: string | null;
    client_external_id: number | null;
    client_name: string | null;
    responsible_external_id: number | null;
    responsible_name: string | null;
    aberto_em: Date;
  },
  agora: Date,
): ChamadoParado {
  const horas = horasParado(row.aberto_em, agora);
  const nomeResp = row.responsible_name?.trim() ?? '';
  const semResponsavel = row.responsible_external_id == null && !nomeResp;
  return {
    ticketNumber: Number(row.ticket_number),
    titulo: row.title,
    empresaChave:
      row.client_external_id != null
        ? String(row.client_external_id)
        : CHAVE_SEM,
    empresa: row.client_name?.trim() || SEM_EMPRESA,
    responsavelChave: semResponsavel
      ? CHAVE_SEM
      : row.responsible_external_id != null
        ? String(row.responsible_external_id)
        : `nome:${nomeResp.toLowerCase()}`,
    responsavel: semResponsavel ? SEM_RESPONSAVEL : nomeResp || SEM_RESPONSAVEL,
    abertoEm: row.aberto_em.toISOString(),
    horasParado: horas,
    mais48h: horas > LIMITE_HORAS_PARADO,
    semResponsavel,
  };
}

export type FiltroParados = {
  empresa?: string;
  responsavel?: string;
  so48h?: boolean;
};

export function filtrarParados(
  linhas: ChamadoParado[],
  filtro: FiltroParados,
): ChamadoParado[] {
  return linhas.filter(
    (l) =>
      (!filtro.empresa || l.empresaChave === filtro.empresa) &&
      (!filtro.responsavel || l.responsavelChave === filtro.responsavel) &&
      (!filtro.so48h || l.mais48h),
  );
}

export function totaisParados(linhas: ChamadoParado[]) {
  return {
    total: linhas.length,
    mais48h: linhas.filter((l) => l.mais48h).length,
    semResponsavel: linhas.filter((l) => l.semResponsavel).length,
  };
}

/**
 * O Excel não tem fuso: mostra a data como foi gravada. O ExcelJS grava em
 * UTC, então sem isto a planilha sairia 3 horas adiantada — o mesmo erro que
 * a tela de relatórios teve em 23/09. Brasília é UTC−3 fixo desde 2019.
 */
export function paraRelogioDeBrasilia(iso: string): Date {
  return new Date(new Date(iso).getTime() - 3 * 3_600_000);
}

/** "true" / "1" / "sim" na query string. */
export function lerBooleano(valor: string | undefined): boolean {
  const v = (valor ?? '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'sim';
}
