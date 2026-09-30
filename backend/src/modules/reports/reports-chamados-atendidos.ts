import ExcelJS from 'exceljs';
import {
  isClientGestorRole,
  isClientPortalRole,
} from '../../common/security/client-portal-role';
import { isComunicacaoSemHoras } from '../rendimento/rendimento-comunicacao.helper';
import { appointmentDurationMinutes } from '../rendimento/rendimento-worked-minutes.helper';

/**
 * Relatório "Chamados atendidos" (tipo 7), pedido pelo cliente gestor: os
 * chamados da empresa abertos OU fechados no período, com os apontamentos
 * feitos dentro do período. Combinado com o Erik em 30/09:
 *
 * - comunicação com o cliente (início = fim) não entra;
 * - apontamento feito por usuário do próprio cliente não entra;
 * - só Excel, com duas abas (Chamados e Apontamentos);
 * - o cliente não vê hora extra, plantão nem equipe.
 */
export const TIPO_CHAMADOS_ATENDIDOS = '7';

export const TODOS_OS_TIPOS = ['1', '4', '5', '6', TIPO_CHAMADOS_ATENDIDOS];

/**
 * Relatórios que cada perfil pode gerar, listar e baixar. O cliente gestor só
 * tem o "Chamados atendidos": os outros trazem dado interno (hora extra,
 * plantão, cobrança). O cliente membro não tem nenhum.
 */
export function tiposDeRelatorioDoPerfil(
  role: string | null | undefined,
): string[] {
  if (isClientGestorRole(role)) return [TIPO_CHAMADOS_ATENDIDOS];
  if (isClientPortalRole(role)) return [];
  return TODOS_OS_TIPOS;
}

export type ChamadoAtendidoSql = {
  ticket_number: number;
  title: string | null;
  requestor_name: string | null;
  responsible_name: string | null;
  desk_name: string | null;
  stage_name: string | null;
  aberto_em: Date;
  fechado_em: Date | null;
};

export type ApontamentoAtendidoSql = {
  ticket_number: number;
  appointment_date: string;
  init_time: string | null;
  end_time: string | null;
  executor: string | null;
  descricao: string;
};

export type ApontamentoAtendido = {
  ticketNumber: number;
  data: string;
  inicio: string;
  fim: string;
  minutos: number;
  executor: string;
  descricao: string;
};

/** Tira a comunicação e calcula a duração de cada apontamento. */
export function apontamentosComHoras(
  rows: ApontamentoAtendidoSql[],
): ApontamentoAtendido[] {
  return rows
    .filter((r) => !isComunicacaoSemHoras(r.init_time, r.end_time))
    .map((r) => ({
      ticketNumber: Number(r.ticket_number),
      data: r.appointment_date,
      inicio: (r.init_time ?? '').slice(0, 5),
      fim: (r.end_time ?? '').slice(0, 5),
      minutos: appointmentDurationMinutes(r.init_time, r.end_time),
      executor: r.executor?.trim() || '-',
      descricao: r.descricao,
    }));
}

/** Minutos apontados por chamado, para a coluna "Horas no período". */
export function minutosPorChamado(
  apontamentos: ApontamentoAtendido[],
): Map<number, number> {
  const total = new Map<number, number>();
  for (const a of apontamentos) {
    total.set(a.ticketNumber, (total.get(a.ticketNumber) ?? 0) + a.minutos);
  }
  return total;
}

/**
 * Primeiro e último instante do período no relógio de Brasília (UTC−3 fixo),
 * em ISO com "Z": a consulta não depende do fuso do servidor. Chamado aberto
 * às 22h de 30/09 em Brasília (01h de 01/10 em UTC) conta em setembro.
 */
export function limitesBrasilia(
  diaInicio: string,
  diaFim: string,
): { inicio: string; fim: string } {
  const [ai, mi, di] = diaInicio.split('-').map(Number);
  const [af, mf, df] = diaFim.split('-').map(Number);
  const inicio = new Date(Date.UTC(ai, mi - 1, di, 3, 0, 0, 0));
  const fim = new Date(Date.UTC(af, mf - 1, df + 1, 3, 0, 0, 0) - 1);
  return { inicio: inicio.toISOString(), fim: fim.toISOString() };
}

/** O Excel não tem fuso e o ExcelJS grava em UTC: Brasília é UTC−3 fixo. */
function relogioBrasilia(d: Date): Date {
  return new Date(d.getTime() - 3 * 3_600_000);
}

/** "2026-09-15" → data do Excel sem deslocar o dia. */
function dataDoDia(ymd: string): Date {
  const [a, m, d] = ymd.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

function duracaoExcel(minutos: number): number | null {
  return minutos > 0 ? minutos / 1440 : null;
}

/** "2026-09-15" → "15/09/2026". */
function brDia(ymd: string): string {
  return ymd.slice(0, 10).split('-').reverse().join('/');
}

function cabecalho(ws: ExcelJS.Worksheet, linha: number, titulos: string[]) {
  const row = ws.getRow(linha);
  row.values = titulos;
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF08182F' },
  };
  row.alignment = { vertical: 'middle' };
  row.height = 20;
}

export async function chamadosAtendidosXlsx(params: {
  empresa: string;
  diaInicio: string;
  diaFim: string;
  geradoEm: string;
  chamados: ChamadoAtendidoSql[];
  apontamentos: ApontamentoAtendido[];
}): Promise<Buffer> {
  const horas = minutosPorChamado(params.apontamentos);
  const titulo = new Map(
    params.chamados.map((c) => [Number(c.ticket_number), c.title ?? '']),
  );
  const periodo = `${brDia(params.diaInicio)} a ${brDia(params.diaFim)}`;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Alle One';

  // Aba 1: um chamado por linha.
  const wc = wb.addWorksheet('Chamados', {
    views: [{ state: 'frozen', ySplit: 4 }],
  });
  wc.getCell('A1').value = `Chamados atendidos — ${params.empresa}`;
  wc.getCell('A1').font = { bold: true, size: 14 };
  wc.getCell('A2').value =
    `Período: ${periodo} · abertos ou fechados no período · gerado em ${params.geradoEm}`;
  wc.columns = [
    { width: 10 },
    { width: 55 },
    { width: 18 },
    { width: 28 },
    { width: 28 },
    { width: 22 },
    { width: 20 },
    { width: 18 },
    { width: 16 },
  ];
  cabecalho(wc, 4, [
    'Nº',
    'Título',
    'Aberto em',
    'Solicitante',
    'Responsável',
    'Mesa',
    'Estágio',
    'Fechado em',
    'Horas no período',
  ]);
  params.chamados.forEach((c, i) => {
    const row = wc.getRow(5 + i);
    row.values = [
      Number(c.ticket_number),
      c.title ?? '',
      relogioBrasilia(c.aberto_em),
      c.requestor_name?.trim() || '-',
      c.responsible_name?.trim() || 'Sem responsável',
      c.desk_name?.trim() || '-',
      c.stage_name?.trim() || '-',
      c.fechado_em ? relogioBrasilia(c.fechado_em) : '-',
      duracaoExcel(horas.get(Number(c.ticket_number)) ?? 0),
    ];
  });
  wc.getColumn(3).numFmt = 'dd/mm/yyyy hh:mm';
  wc.getColumn(8).numFmt = 'dd/mm/yyyy hh:mm';
  wc.getColumn(9).numFmt = '[h]:mm';
  if (params.chamados.length) {
    wc.autoFilter = {
      from: { row: 4, column: 1 },
      to: { row: 4 + params.chamados.length, column: 9 },
    };
  }

  // Aba 2: um apontamento por linha.
  const wa = wb.addWorksheet('Apontamentos', {
    views: [{ state: 'frozen', ySplit: 4 }],
  });
  wa.getCell('A1').value = `Apontamentos — ${params.empresa}`;
  wa.getCell('A1').font = { bold: true, size: 14 };
  wa.getCell('A2').value = `Período: ${periodo} · só os feitos no período`;
  wa.columns = [
    { width: 10 },
    { width: 45 },
    { width: 12 },
    { width: 8 },
    { width: 8 },
    { width: 10 },
    { width: 28 },
    { width: 80 },
  ];
  cabecalho(wa, 4, [
    'Nº',
    'Título',
    'Data',
    'Início',
    'Fim',
    'Duração',
    'Quem executou',
    'Descrição',
  ]);
  params.apontamentos.forEach((a, i) => {
    const row = wa.getRow(5 + i);
    row.values = [
      a.ticketNumber,
      titulo.get(a.ticketNumber) ?? '',
      dataDoDia(a.data),
      a.inicio,
      a.fim,
      duracaoExcel(a.minutos),
      a.executor,
      a.descricao,
    ];
    row.getCell(8).alignment = { wrapText: true, vertical: 'top' };
  });
  wa.getColumn(3).numFmt = 'dd/mm/yyyy';
  wa.getColumn(6).numFmt = '[h]:mm';
  const ultima = 4 + params.apontamentos.length;
  if (params.apontamentos.length) {
    wa.autoFilter = {
      from: { row: 4, column: 1 },
      to: { row: ultima, column: 8 },
    };
    const total = wa.getRow(ultima + 1);
    total.getCell(5).value = 'Total';
    total.getCell(6).value = {
      formula: `SUM(F5:F${ultima})`,
      result:
        duracaoExcel(params.apontamentos.reduce((s, a) => s + a.minutos, 0)) ??
        0,
    };
    total.font = { bold: true };
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
