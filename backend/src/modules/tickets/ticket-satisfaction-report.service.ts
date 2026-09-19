import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Quantas respostas alguém precisa ter no período para entrar no ranking.
 * Sem isso quem recebeu uma única nota 5 apareceria em primeiro lugar.
 */
export const MINIMO_RESPOSTAS_RANKING = 5;

type Linha = {
  rating: number;
  responsibleName: string | null;
  specialtyId: string | null;
  companyId: string | null;
  answeredAt: Date | null;
};

export type ResumoSatisfacao = {
  periodo: { de: string; ate: string };
  enviadas: number;
  respondidas: number;
  taxaResposta: number;
  media: number | null;
  nps: number | null;
  distribuicao: Array<{ estrelas: number; total: number }>;
  porMes: Array<{ mes: string; media: number; nps: number; respostas: number }>;
  porMesa: Array<{ nome: string; media: number; nps: number; respostas: number }>;
  porEmpresa: Array<{ nome: string; media: number; nps: number; respostas: number }>;
  ranking: Array<{
    nome: string;
    media: number;
    nps: number;
    respostas: number;
    promotores: number;
    detratores: number;
  }>;
  /** Fora do ranking por não ter respostas suficientes ainda. */
  semVolumeSuficiente: Array<{ nome: string; respostas: number }>;
};

/**
 * NPS a partir das estrelas: 5 é promotor, 4 é neutro, 1 a 3 é detrator.
 *
 * É a conversão usada no mercado para pesquisa de 1–5. Serve para comparar
 * mesas, pessoas e meses entre si; não é o NPS canônico (0–10, "quanto
 * recomendaria"), que exige a pergunta relacional.
 */
export function calcularNps(notas: number[]): number | null {
  if (notas.length === 0) return null;
  const promotores = notas.filter((n) => n >= 5).length;
  const detratores = notas.filter((n) => n <= 3).length;
  return Math.round(
    ((promotores - detratores) / notas.length) * 100,
  );
}

export function calcularMedia(notas: number[]): number | null {
  if (notas.length === 0) return null;
  const soma = notas.reduce((acc, n) => acc + n, 0);
  return Math.round((soma / notas.length) * 100) / 100;
}

function agrupar(
  linhas: Linha[],
  chave: (linha: Linha) => string | null,
  rotulo: (valor: string) => string,
) {
  const mapa = new Map<string, number[]>();
  for (const linha of linhas) {
    const valor = chave(linha);
    if (!valor) continue;
    const atual = mapa.get(valor) ?? [];
    atual.push(linha.rating);
    mapa.set(valor, atual);
  }
  return [...mapa.entries()]
    .map(([valor, notas]) => ({
      nome: rotulo(valor),
      media: calcularMedia(notas) ?? 0,
      nps: calcularNps(notas) ?? 0,
      respostas: notas.length,
    }))
    .sort((a, b) => b.media - a.media || b.respostas - a.respostas);
}

@Injectable()
export class TicketSatisfactionReportService {
  constructor(private readonly prisma: PrismaService) {}

  async resumo(params: { de?: string; ate?: string }): Promise<ResumoSatisfacao> {
    const ate = params.ate ? new Date(`${params.ate}T23:59:59.999`) : new Date();
    const de = params.de
      ? new Date(`${params.de}T00:00:00.000`)
      : new Date(ate.getFullYear(), ate.getMonth() - 5, 1);

    const [enviadas, respostas, mesas, empresas] = await Promise.all([
      this.prisma.ticketSatisfactionSurvey.count({
        where: { sentAt: { gte: de, lte: ate } },
      }),
      this.prisma.ticketSatisfactionSurvey.findMany({
        where: { answeredAt: { gte: de, lte: ate }, rating: { not: null } },
        select: {
          rating: true,
          responsibleName: true,
          specialtyId: true,
          companyId: true,
          answeredAt: true,
        },
      }),
      this.prisma.specialty.findMany({ select: { id: true, name: true } }),
      this.prisma.company.findMany({ select: { id: true, name: true } }),
    ]);

    const linhas = respostas.map((row) => ({
      rating: Number(row.rating),
      responsibleName: row.responsibleName,
      specialtyId: row.specialtyId,
      companyId: row.companyId,
      answeredAt: row.answeredAt,
    }));
    const notas = linhas.map((l) => l.rating);

    const nomeMesa = new Map(mesas.map((m) => [m.id, m.name]));
    const nomeEmpresa = new Map(empresas.map((c) => [c.id, c.name]));

    const distribuicao = [1, 2, 3, 4, 5].map((estrelas) => ({
      estrelas,
      total: notas.filter((n) => n === estrelas).length,
    }));

    const porMes = agrupar(
      linhas,
      (l) => (l.answeredAt ? l.answeredAt.toISOString().slice(0, 7) : null),
      (valor) => valor,
    )
      .map((item) => ({
        mes: item.nome,
        media: item.media,
        nps: item.nps,
        respostas: item.respostas,
      }))
      .sort((a, b) => a.mes.localeCompare(b.mes));

    // O ranking é por pessoa: conta para quem estava com o chamado no
    // fechamento, que é quem o cliente avaliou.
    const porPessoa = new Map<string, number[]>();
    for (const linha of linhas) {
      const nome = linha.responsibleName?.trim();
      if (!nome) continue;
      const atual = porPessoa.get(nome) ?? [];
      atual.push(linha.rating);
      porPessoa.set(nome, atual);
    }

    const ranking = [...porPessoa.entries()]
      .filter(([, notasPessoa]) => notasPessoa.length >= MINIMO_RESPOSTAS_RANKING)
      .map(([nome, notasPessoa]) => ({
        nome,
        media: calcularMedia(notasPessoa) ?? 0,
        nps: calcularNps(notasPessoa) ?? 0,
        respostas: notasPessoa.length,
        promotores: notasPessoa.filter((n) => n >= 5).length,
        detratores: notasPessoa.filter((n) => n <= 3).length,
      }))
      .sort((a, b) => b.media - a.media || b.respostas - a.respostas);

    const semVolumeSuficiente = [...porPessoa.entries()]
      .filter(([, notasPessoa]) => notasPessoa.length < MINIMO_RESPOSTAS_RANKING)
      .map(([nome, notasPessoa]) => ({ nome, respostas: notasPessoa.length }))
      .sort((a, b) => b.respostas - a.respostas);

    return {
      periodo: { de: de.toISOString().slice(0, 10), ate: ate.toISOString().slice(0, 10) },
      enviadas,
      respondidas: linhas.length,
      taxaResposta:
        enviadas > 0 ? Math.round((linhas.length / enviadas) * 100) : 0,
      media: calcularMedia(notas),
      nps: calcularNps(notas),
      distribuicao,
      porMes,
      porMesa: agrupar(
        linhas,
        (l) => l.specialtyId,
        (valor) => nomeMesa.get(valor) ?? 'Sem mesa',
      ),
      porEmpresa: agrupar(
        linhas,
        (l) => l.companyId,
        (valor) => nomeEmpresa.get(valor) ?? 'Sem empresa',
      ),
      ranking,
      semVolumeSuficiente,
    };
  }

  /** Respostas com comentário, para a tela listar. */
  async respostas(params: { de?: string; ate?: string; limit?: number }) {
    const ate = params.ate ? new Date(`${params.ate}T23:59:59.999`) : new Date();
    const de = params.de
      ? new Date(`${params.de}T00:00:00.000`)
      : new Date(ate.getFullYear(), ate.getMonth() - 5, 1);

    const rows = await this.prisma.ticketSatisfactionSurvey.findMany({
      where: { answeredAt: { gte: de, lte: ate }, rating: { not: null } },
      orderBy: { answeredAt: 'desc' },
      take: Math.min(Math.max(params.limit ?? 200, 1), 500),
      select: {
        ticketNumber: true,
        rating: true,
        comment: true,
        answeredAt: true,
        requestorName: true,
        responsibleName: true,
        companyId: true,
        channel: true,
      },
    });

    const empresas = await this.prisma.company.findMany({
      select: { id: true, name: true },
    });
    const nomeEmpresa = new Map(empresas.map((c) => [c.id, c.name]));

    return rows.map((row) => ({
      ticketNumber: row.ticketNumber,
      rating: row.rating,
      comment: row.comment,
      answeredAt: row.answeredAt?.toISOString() ?? null,
      requestorName: row.requestorName,
      responsibleName: row.responsibleName,
      companyName: row.companyId ? (nomeEmpresa.get(row.companyId) ?? null) : null,
      channel: row.channel,
    }));
  }
}
