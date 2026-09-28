import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { PrismaService } from '../../prisma/prisma.service';
import { ROUTINE_AUTOMATION_USER_EMAIL } from '../tickets/routine-ticket.helper';
import { resolveTicketStageGroup } from '../tickets/tickets-stage-groups';
import { mesBrasilia } from '../contrato-aviso/contrato-aviso-regras';
import {
  CHAVE_SEM,
  EVENTOS_QUE_MEXEM,
  JANELA_AUTOMACAO_SEGUNDOS,
  SEM_EMPRESA,
  SEM_RESPONSAVEL,
  type ChamadoParado,
  type FiltroParados,
  type Visao,
  ehRotina,
  filtrarParados,
  montarChamadoParado,
  paraRelogioDeBrasilia,
  totaisParados,
} from './painel-chamados-regras';

type LinhaParadaSql = {
  ticket_number: number;
  title: string | null;
  client_external_id: number | null;
  client_name: string | null;
  responsible_external_id: number | null;
  responsible_name: string | null;
  created_by: string | null;
  created_by_way_of: string | null;
  aberto_em: Date;
};

type LinhaChamadoSql = {
  ticket_number: number;
  title: string | null;
  client_external_id: number | null;
  client_name: string | null;
  responsible_external_id: number | null;
  responsible_name: string | null;
  stage_name: string | null;
  is_closed: boolean;
  aberto_em: Date;
  ultima_atividade: Date;
};

export type ChamadoDoGrupo = {
  ticketNumber: number;
  titulo: string | null;
  empresa: string;
  responsavel: string;
  estagio: string | null;
  fechado: boolean;
  abertoEm: string;
  ultimaAtividade: string;
};

export type GrupoResumo = {
  chave: string;
  nome: string;
  abertos: number;
  parados48h: number;
  fechadosNoMes: number;
};

/**
 * Abas de admin em Apontamentos. As duas partem da mesma definição de
 * "parado" (ver regras), então o número da aba 2 bate com a lista da aba 1.
 */
@Injectable()
export class PainelChamadosService {
  constructor(private readonly prisma: PrismaService) {}

  private async automacaoId(): Promise<string | null> {
    const u = await this.prisma.user.findUnique({
      where: { email: ROUTINE_AUTOMATION_USER_EMAIL },
      select: { id: true },
    });
    return u?.id ?? null;
  }

  /**
   * Nomes de estágio, entre os chamados abertos, que o portal trata como
   * "Novo" (inclui os apelidos: Aberto, Pendente, Pending…). A regra fica em
   * TypeScript (resolveTicketStageGroup); o SQL recebe a lista pronta.
   */
  private async estagiosNovo(): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ stage_name: string }>>`
      SELECT DISTINCT stage_name FROM portal_tickets
      WHERE is_closed = false AND stage_name IS NOT NULL
    `;
    return rows
      .map((r) => r.stage_name)
      .filter((nome) => resolveTicketStageGroup(nome) === 'novo');
  }

  /**
   * Chamado aberto em que ninguém mexeu: nenhum apontamento (a comunicação é
   * gravada como apontamento) e nenhum evento de mexer no histórico, sem
   * contar o que aconteceu colado numa execução de regra de automação.
   */
  private nuncaMexido(): Prisma.Sql {
    const janela = Prisma.raw(
      `interval '${JANELA_AUTOMACAO_SEGUNDOS} seconds'`,
    );
    return Prisma.sql`
      NOT EXISTS (
        SELECT 1 FROM portal_ticket_appointments a
        WHERE a.ticket_number = t.ticket_number
          AND NOT EXISTS (
            SELECT 1 FROM ticket_automation_runs r
            WHERE r.ticket_number = a.ticket_number
              AND r.created_at BETWEEN a.created_at - ${janela} AND a.created_at + ${janela}
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM ticket_history h
        WHERE h.ticket_number = t.ticket_number
          AND h.event_type = ANY(${[...EVENTOS_QUE_MEXEM]}::text[])
          AND NOT EXISTS (
            SELECT 1 FROM ticket_automation_runs r
            WHERE r.ticket_number = h.ticket_number
              AND r.created_at BETWEEN h.occurred_at - ${janela} AND h.occurred_at + ${janela}
          )
      )
    `;
  }

  /** Aba "Chamados parados": do mais antigo para o mais novo. */
  async parados(agora = new Date()): Promise<ChamadoParado[]> {
    const [automacao, novo] = await Promise.all([
      this.automacaoId(),
      this.estagiosNovo(),
    ]);
    if (novo.length === 0) return [];

    const rows = await this.prisma.$queryRaw<LinhaParadaSql[]>`
      SELECT t.ticket_number, t.title, t.client_external_id, t.client_name,
             t.responsible_external_id, t.responsible_name,
             t.created_by, t.created_by_way_of,
             COALESCE(t.created_at_source, t.created_at) AS aberto_em
      FROM portal_tickets t
      WHERE t.is_closed = false
        AND t.stage_name = ANY(${novo}::text[])
        AND ${this.nuncaMexido()}
      ORDER BY COALESCE(t.created_at_source, t.created_at) ASC, t.ticket_number ASC
    `;

    return rows
      .filter(
        (r) =>
          !ehRotina({
            criadoPor: r.created_by,
            formaAbertura: r.created_by_way_of,
            titulo: r.title,
            automacaoId: automacao,
          }),
      )
      .map((r) => montarChamadoParado(r, agora));
  }

  async paradosFiltrados(filtro: FiltroParados, agora = new Date()) {
    const linhas = filtrarParados(await this.parados(agora), filtro);
    return { linhas, totais: totaisParados(linhas) };
  }

  private chaveSql(visao: Visao): Prisma.Sql {
    return visao === 'empresa'
      ? Prisma.sql`COALESCE(t.client_external_id::text, ${CHAVE_SEM})`
      : Prisma.sql`CASE
          WHEN t.responsible_external_id IS NOT NULL THEN t.responsible_external_id::text
          WHEN COALESCE(btrim(t.responsible_name), '') <> ''
            THEN 'nome:' || lower(btrim(t.responsible_name))
          ELSE ${CHAVE_SEM}
        END`;
  }

  /**
   * Data em que o chamado fechou: último fechamento no histórico; sem ele
   * (chamado que veio fechado do TiFlux), a última atualização da origem.
   */
  private fechadoEmSql(): Prisma.Sql {
    return Prisma.sql`COALESCE(
      (SELECT max(h.occurred_at) FROM ticket_history h
        WHERE h.ticket_number = t.ticket_number
          AND h.event_type IN ('TICKET_CLOSED', 'STAGE_CHANGED')),
      t.updated_at_source AT TIME ZONE 'UTC',
      t.updated_at AT TIME ZONE 'UTC'
    )`;
  }

  /** Recorte: abertos; com incluirFechados, também os fechados no mês civil. */
  private recorteSql(incluirFechados: boolean, agora: Date): Prisma.Sql {
    if (!incluirFechados) return Prisma.sql`t.is_closed = false`;
    const { inicio, fim } = mesBrasilia(agora);
    return Prisma.sql`(t.is_closed = false OR (
      t.is_closed = true AND ${this.fechadoEmSql()} BETWEEN ${inicio} AND ${fim}
    ))`;
  }

  /** Aba "Chamados por responsável": resumo por empresa ou por responsável. */
  async resumo(visao: Visao, incluirFechados: boolean, agora = new Date()) {
    const chave = this.chaveSql(visao);
    const nome =
      visao === 'empresa'
        ? Prisma.sql`COALESCE(NULLIF(btrim(max(t.client_name)), ''), ${SEM_EMPRESA})`
        : Prisma.sql`COALESCE(NULLIF(btrim(max(t.responsible_name)), ''), ${SEM_RESPONSAVEL})`;

    const [rows, parados] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          chave: string;
          nome: string;
          abertos: bigint;
          fechados: bigint;
        }>
      >`
        SELECT ${chave} AS chave, ${nome} AS nome,
               count(*) FILTER (WHERE t.is_closed = false) AS abertos,
               count(*) FILTER (WHERE t.is_closed = true) AS fechados
        FROM portal_tickets t
        WHERE ${this.recorteSql(incluirFechados, agora)}
        GROUP BY 1
      `,
      this.parados(agora),
    ]);

    // "Parados há mais de 48h" = a mesma lista da aba "Chamados parados".
    const parados48 = new Map<string, number>();
    for (const p of parados) {
      if (!p.mais48h) continue;
      const k = visao === 'empresa' ? p.empresaChave : p.responsavelChave;
      parados48.set(k, (parados48.get(k) ?? 0) + 1);
    }

    const grupos: GrupoResumo[] = rows
      .map((r) => ({
        chave: r.chave,
        nome: r.nome,
        abertos: Number(r.abertos),
        parados48h: parados48.get(r.chave) ?? 0,
        fechadosNoMes: Number(r.fechados),
      }))
      .sort(
        (a, b) =>
          b.abertos - a.abertos || a.nome.localeCompare(b.nome, 'pt-BR'),
      );

    return {
      grupos,
      totais: {
        abertos: grupos.reduce((s, g) => s + g.abertos, 0),
        parados48h: grupos.reduce((s, g) => s + g.parados48h, 0),
        fechadosNoMes: grupos.reduce((s, g) => s + g.fechadosNoMes, 0),
      },
    };
  }

  /** Chamados de um grupo (ou de todos, sem chave), para a lista e o Excel. */
  async chamados(
    visao: Visao,
    chave: string | null,
    incluirFechados: boolean,
    agora = new Date(),
  ): Promise<ChamadoDoGrupo[]> {
    const filtroChave = chave
      ? Prisma.sql`AND ${this.chaveSql(visao)} = ${chave}`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<LinhaChamadoSql[]>`
      SELECT t.ticket_number, t.title, t.client_external_id, t.client_name,
             t.responsible_external_id, t.responsible_name, t.stage_name,
             t.is_closed,
             COALESCE(t.created_at_source, t.created_at) AS aberto_em,
             GREATEST(
               COALESCE(t.created_at_source, t.created_at) AT TIME ZONE 'UTC',
               (SELECT max(a.created_at) FROM portal_ticket_appointments a
                 WHERE a.ticket_number = t.ticket_number),
               (SELECT max(h.occurred_at) FROM ticket_history h
                 WHERE h.ticket_number = t.ticket_number)
             ) AS ultima_atividade
      FROM portal_tickets t
      WHERE ${this.recorteSql(incluirFechados, agora)}
      ${filtroChave}
      ORDER BY COALESCE(t.created_at_source, t.created_at) ASC, t.ticket_number ASC
    `;
    return rows.map((r) => ({
      ticketNumber: Number(r.ticket_number),
      titulo: r.title,
      empresa: r.client_name?.trim() || SEM_EMPRESA,
      responsavel: r.responsible_name?.trim() || SEM_RESPONSAVEL,
      estagio: r.stage_name,
      fechado: r.is_closed,
      abertoEm: r.aberto_em.toISOString(),
      ultimaAtividade: r.ultima_atividade.toISOString(),
    }));
  }

  async planilhaParados(filtro: FiltroParados): Promise<Buffer> {
    const { linhas } = await this.paradosFiltrados(filtro);
    return this.planilha(
      'Chamados parados',
      [
        { titulo: 'Nº', largura: 10 },
        { titulo: 'Título', largura: 60 },
        { titulo: 'Cliente', largura: 32 },
        { titulo: 'Responsável', largura: 28 },
        { titulo: 'Aberto em', largura: 20, data: true },
        { titulo: 'Horas parado', largura: 14 },
      ],
      linhas.map((l) => [
        l.ticketNumber,
        l.titulo ?? '',
        l.empresa,
        l.responsavel,
        paraRelogioDeBrasilia(l.abertoEm),
        l.horasParado,
      ]),
    );
  }

  async planilhaChamados(
    visao: Visao,
    chave: string | null,
    incluirFechados: boolean,
  ): Promise<Buffer> {
    const linhas = await this.chamados(visao, chave, incluirFechados);
    return this.planilha(
      'Chamados por responsável',
      [
        { titulo: 'Nº', largura: 10 },
        { titulo: 'Título', largura: 60 },
        { titulo: 'Cliente', largura: 32 },
        { titulo: 'Responsável', largura: 28 },
        { titulo: 'Estágio', largura: 20 },
        { titulo: 'Aberto em', largura: 20, data: true },
        { titulo: 'Última atividade', largura: 20, data: true },
      ],
      linhas.map((l) => [
        l.ticketNumber,
        l.titulo ?? '',
        l.empresa,
        l.responsavel,
        l.estagio ?? '',
        paraRelogioDeBrasilia(l.abertoEm),
        paraRelogioDeBrasilia(l.ultimaAtividade),
      ]),
    );
  }

  private async planilha(
    nomeAba: string,
    colunas: Array<{ titulo: string; largura: number; data?: boolean }>,
    linhas: Array<Array<string | number | Date>>,
  ): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Alle One';
    const ws = wb.addWorksheet(nomeAba, {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    ws.columns = colunas.map((c) => ({ header: c.titulo, width: c.largura }));
    ws.getRow(1).font = { bold: true };
    for (const linha of linhas) ws.addRow(linha);
    colunas.forEach((c, i) => {
      if (c.data) ws.getColumn(i + 1).numFmt = 'dd/mm/yyyy hh:mm';
    });
    if (linhas.length > 0) {
      ws.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: linhas.length + 1, column: colunas.length },
      };
    }
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}
