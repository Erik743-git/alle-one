import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { randomBytes } from 'crypto';

import { PrismaService } from '../../prisma/prisma.service';
import { getFrontendBaseUrl } from '../auth/password-reset.helper';
import { MailService } from '../mail/mail.service';
import {
  NPS_INTERVALO_MAXIMO,
  NPS_INTERVALO_PADRAO,
  NPS_NOTA_ALERTA_MAXIMA,
  calcularNps,
  classe,
  deveEnviar,
  podeTrocarNota,
  trimestre,
} from './nps-regras';

function escapeHtml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const COMENTARIO_MAX = 2000;
const PAPEIS_CLIENTE: UserRole[] = ['CLIENT', 'CLIENT_GESTOR', 'CLIENT_MEMBER'];

export type ConfigNpsEmpresa = {
  companyId: string;
  ativo: boolean;
  intervaloMeses: number;
  destinatarios: string[];
  /** Pessoas do portal cliente da empresa, para escolher quem recebe. */
  pessoas: Array<{ id: string; nome: string; email: string; papel: string }>;
};

/**
 * NPS por empresa: quem o admin escolher recebe, de N em N meses, a pergunta
 * "De 0 a 10, quanto você recomendaria a Alle?". O link do e-mail responde
 * sem login (o token é da pessoa). Nota 0–6 avisa os admins.
 */
@Injectable()
export class NpsService {
  private readonly logger = new Logger(NpsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  // ---------------------------------------------------------------- config

  /** Usuários do portal cliente ativos ligados à empresa. */
  private async pessoasDaEmpresa(companyId: string) {
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        role: { in: PAPEIS_CLIENTE },
        OR: [{ companyId }, { companyMemberships: { some: { companyId } } }],
      },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: 'asc' },
    });
    return users.map((u) => ({
      id: u.id,
      nome: u.name,
      email: u.email,
      papel: u.role,
    }));
  }

  async config(companyId: string): Promise<ConfigNpsEmpresa> {
    const empresa = await this.prisma.company.findFirst({
      where: { id: companyId, deletedAt: null },
      select: { id: true },
    });
    if (!empresa) throw new NotFoundException('Empresa não encontrada.');
    const [cfg, dest, pessoas] = await Promise.all([
      this.prisma.npsConfigEmpresa.findUnique({ where: { companyId } }),
      this.prisma.npsDestinatario.findMany({
        where: { companyId },
        select: { userId: true },
      }),
      this.pessoasDaEmpresa(companyId),
    ]);
    return {
      companyId,
      ativo: cfg?.ativo ?? false,
      intervaloMeses: cfg?.intervaloMeses ?? NPS_INTERVALO_PADRAO,
      destinatarios: dest.map((d) => d.userId),
      pessoas,
    };
  }

  async salvarConfig(
    adminId: string,
    companyId: string,
    dados: { ativo: boolean; intervaloMeses: number; destinatarios: string[] },
  ): Promise<ConfigNpsEmpresa> {
    const intervalo = Math.trunc(dados.intervaloMeses);
    if (!(intervalo >= 1 && intervalo <= NPS_INTERVALO_MAXIMO)) {
      throw new BadRequestException(
        `O intervalo vai de 1 a ${NPS_INTERVALO_MAXIMO} meses.`,
      );
    }
    const pessoas = await this.pessoasDaEmpresa(companyId);
    const validos = new Set(pessoas.map((p) => p.id));
    const escolhidos = [...new Set(dados.destinatarios)];
    // Só gente do portal cliente desta empresa: impede mandar o NPS (e o
    // token) para usuário de outra empresa ou da equipe.
    if (escolhidos.some((id) => !validos.has(id))) {
      throw new BadRequestException(
        'Só usuários do portal desta empresa podem receber o NPS.',
      );
    }
    if (dados.ativo && !escolhidos.length) {
      throw new BadRequestException(
        'Escolha ao menos uma pessoa para receber o NPS.',
      );
    }
    await this.prisma.$transaction([
      this.prisma.npsConfigEmpresa.upsert({
        where: { companyId },
        create: {
          companyId,
          ativo: dados.ativo,
          intervaloMeses: intervalo,
          updatedBy: adminId,
        },
        update: {
          ativo: dados.ativo,
          intervaloMeses: intervalo,
          updatedBy: adminId,
        },
      }),
      this.prisma.npsDestinatario.deleteMany({
        where: { companyId, userId: { notIn: escolhidos } },
      }),
      this.prisma.npsDestinatario.createMany({
        data: escolhidos.map((userId) => ({ companyId, userId })),
        skipDuplicates: true,
      }),
    ]);
    return this.config(companyId);
  }

  // ----------------------------------------------------------------- envio

  /**
   * Rotina diária: manda a pergunta para cada destinatário cujo último envio
   * já passou do intervalo da empresa. Pessoa inativa, apagada ou que saiu
   * da empresa fica de fora (a lista é conferida na hora).
   */
  async enviarPendentes(agora = new Date()): Promise<number> {
    const empresas = await this.prisma.npsConfigEmpresa.findMany({
      where: { ativo: true, company: { deletedAt: null } },
      select: {
        companyId: true,
        intervaloMeses: true,
        company: { select: { name: true } },
      },
    });
    let enviados = 0;
    for (const emp of empresas) {
      const [dest, pessoas] = await Promise.all([
        this.prisma.npsDestinatario.findMany({
          where: { companyId: emp.companyId },
          select: { userId: true },
        }),
        this.pessoasDaEmpresa(emp.companyId),
      ]);
      const ativos = new Map(pessoas.map((p) => [p.id, p]));
      const ids = dest.map((d) => d.userId).filter((id) => ativos.has(id));
      if (!ids.length) continue;
      // Último envio de cada pessoa nesta empresa, numa consulta só.
      const ultimos = await this.prisma.npsPesquisa.groupBy({
        by: ['userId'],
        where: { companyId: emp.companyId, userId: { in: ids } },
        _max: { enviadaEm: true },
      });
      const ultimoPor = new Map(
        ultimos.map((u) => [u.userId, u._max.enviadaEm]),
      );
      for (const userId of ids) {
        if (
          !deveEnviar(ultimoPor.get(userId) ?? null, emp.intervaloMeses, agora)
        ) {
          continue;
        }
        const pessoa = ativos.get(userId)!;
        const pesquisa = await this.prisma.npsPesquisa.create({
          data: {
            token: randomBytes(24).toString('hex'),
            companyId: emp.companyId,
            userId,
            email: pessoa.email,
            nome: pessoa.nome,
            enviadaEm: agora,
          },
          select: { token: true },
        });
        await this.enviarEmail(pessoa, emp.company.name, pesquisa.token);
        enviados += 1;
      }
    }
    if (enviados) this.logger.log(`NPS: ${enviados} pergunta(s) enviada(s).`);
    return enviados;
  }

  private async enviarEmail(
    pessoa: { nome: string; email: string },
    empresa: string,
    token: string,
  ) {
    const base = `${getFrontendBaseUrl()}/nps/${token}`;
    const numeros = Array.from({ length: 11 }, (_, n) => n);
    const botoes = numeros
      .map(
        (n) =>
          `<a href="${escapeHtml(`${base}?nota=${n}`)}" style="display:inline-block;min-width:28px;margin:2px;padding:8px 6px;border-radius:6px;background:#0e7490;color:#fff;text-decoration:none;font:600 14px Arial,sans-serif;text-align:center">${n}</a>`,
      )
      .join('');
    try {
      await this.mail.sendMail({
        to: [pessoa.email],
        subject: 'De 0 a 10, quanto você recomendaria a Alle?',
        text: [
          `Olá, ${pessoa.nome}.`,
          '',
          `De 0 a 10, quanto você recomendaria a Alle Tecnologia a um colega ou outra empresa? (${empresa})`,
          '',
          `Responda por aqui, leva um minuto: ${base}`,
          '',
          'Alle Tecnologia',
        ].join('\n'),
        html: `<p>Olá, ${escapeHtml(pessoa.nome)}.</p>
<p>De 0 a 10, quanto você recomendaria a <strong>Alle Tecnologia</strong> a um colega ou outra empresa?</p>
<p>${botoes}</p>
<p style="font:12px Arial,sans-serif;color:#555">0 = não recomendaria · 10 = recomendaria com certeza</p>
<p>Depois de escolher a nota você pode contar o porquê. Não precisa entrar no portal.</p>
<p>Alle Tecnologia</p>`,
      });
    } catch (err) {
      // A pesquisa fica criada: o pop-up do portal ainda pergunta.
      this.logger.warn(
        `NPS: e-mail para ${pessoa.email} falhou: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // -------------------------------------------------------------- resposta

  async obterPorToken(token: string) {
    const p = await this.prisma.npsPesquisa.findUnique({
      where: { token },
      select: {
        nome: true,
        nota: true,
        comentario: true,
        respondidaEm: true,
        company: { select: { name: true } },
      },
    });
    if (!p) throw new NotFoundException('Pesquisa não encontrada.');
    return {
      nome: p.nome,
      empresa: p.company.name,
      nota: p.nota,
      comentario: p.comentario,
      respondidaEm: p.respondidaEm?.toISOString() ?? null,
      editavel: podeTrocarNota(p.respondidaEm, new Date()),
    };
  }

  async responder(
    token: string,
    resposta: {
      nota: number;
      comentario?: string | null;
      canal: 'EMAIL' | 'PORTAL';
    },
  ) {
    const nota = resposta.nota;
    if (!Number.isInteger(nota) || nota < 0 || nota > 10) {
      throw new BadRequestException('A nota vai de 0 a 10.');
    }
    const comentario = (resposta.comentario ?? '')
      .trim()
      .slice(0, COMENTARIO_MAX);
    const p = await this.prisma.npsPesquisa.findUnique({
      where: { token },
      select: {
        id: true,
        respondidaEm: true,
        alertaEm: true,
        comentario: true,
      },
    });
    if (!p) throw new NotFoundException('Pesquisa não encontrada.');
    const agora = new Date();
    if (!podeTrocarNota(p.respondidaEm, agora)) {
      throw new BadRequestException(
        'Esta resposta já foi registrada e não pode mais ser alterada.',
      );
    }
    await this.prisma.npsPesquisa.update({
      where: { id: p.id },
      data: {
        nota,
        // O clique no número do e-mail chega sem texto: não apaga o
        // comentário que a pessoa já tinha escrito.
        comentario: comentario || p.comentario || null,
        canal: resposta.canal,
        respondidaEm: p.respondidaEm ?? agora,
      },
    });
    if (nota <= NPS_NOTA_ALERTA_MAXIMA && !p.alertaEm) {
      // Marca antes de avisar: duas respostas seguidas não geram dois avisos.
      const marcou = await this.prisma.npsPesquisa.updateMany({
        where: { id: p.id, alertaEm: null },
        data: { alertaEm: agora },
      });
      if (marcou.count) await this.avisarNotaBaixa(p.id);
    }
    return { ok: true, nota };
  }

  /**
   * Nota 0–6: e-mail para os admins com empresa, pessoa, nota e comentário,
   * mais o aviso no Correio. Nunca lança (a resposta já foi gravada).
   */
  private async avisarNotaBaixa(id: string) {
    try {
      const p = await this.prisma.npsPesquisa.findUniqueOrThrow({
        where: { id },
        select: {
          nome: true,
          email: true,
          nota: true,
          comentario: true,
          company: { select: { name: true } },
        },
      });
      const admins = await this.prisma.user.findMany({
        where: { role: 'ADMIN', deletedAt: null, status: 'ACTIVE' },
        select: { id: true, email: true },
      });
      const titulo = `NPS ${p.nota} — ${p.company.name}`;
      const linhas = [
        `${p.nome ?? p.email} (${p.email}), da ${p.company.name}, deu nota ${p.nota} de 10 no NPS.`,
        '',
        p.comentario
          ? `Por quê: ${p.comentario}`
          : 'A pessoa não escreveu o porquê.',
        '',
        'Vale um contato ainda esta semana.',
      ];
      const link = `${getFrontendBaseUrl()}/admin/satisfacao?aba=nps`;
      if (admins.length) {
        await this.mail
          .sendMail({
            to: admins.map((a) => a.email),
            subject: `[NPS] Nota ${p.nota} — ${p.company.name}`,
            text: `${linhas.join('\n')}\n\n${link}\n\nAlle One`,
            html: `${linhas
              .filter(Boolean)
              .map((l) => `<p>${escapeHtml(l)}</p>`)
              .join(
                '',
              )}<p><a href="${escapeHtml(link)}">Abrir o painel de NPS</a></p>`,
          })
          .catch((err: unknown) =>
            this.logger.warn(
              `NPS: e-mail de nota baixa falhou: ${err instanceof Error ? err.message : String(err)}`,
            ),
          );
      }
      await this.prisma.mailboxNotification.createMany({
        data: admins.map((a) => ({
          userId: a.id,
          kind: 'NPS_DETRATOR' as const,
          title: titulo.slice(0, 200),
          body: (p.comentario
            ? `Por quê: ${p.comentario}`
            : 'Sem comentário.'
          ).slice(0, 500),
          href: '/admin/satisfacao?aba=nps',
          dedupeKey: `nps-detrator-${id}`,
        })),
        skipDuplicates: true,
      });
    } catch (err) {
      this.logger.warn(
        `NPS: aviso de nota baixa falhou: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ---------------------------------------------------------------- painel

  async painel(params: { de?: string; ate?: string; companyId?: string }) {
    const where: Prisma.NpsPesquisaWhereInput = {
      ...(params.companyId ? { companyId: params.companyId } : {}),
    };
    const periodo: Prisma.DateTimeFilter = {};
    if (params.de) periodo.gte = new Date(`${params.de}T03:00:00.000Z`);
    if (params.ate) {
      const fim = new Date(`${params.ate}T03:00:00.000Z`);
      fim.setUTCDate(fim.getUTCDate() + 1);
      periodo.lt = fim;
    }
    for (const d of [periodo.gte, periodo.lt]) {
      if (d && Number.isNaN((d as Date).getTime())) {
        throw new BadRequestException('Data inválida.');
      }
    }
    const [enviadas, respostas] = await Promise.all([
      this.prisma.npsPesquisa.count({
        where: {
          ...where,
          ...(periodo.gte || periodo.lt ? { enviadaEm: periodo } : {}),
        },
      }),
      this.prisma.npsPesquisa.findMany({
        where: {
          ...where,
          nota: { not: null },
          respondidaEm: periodo.gte || periodo.lt ? periodo : { not: null },
        },
        select: {
          nota: true,
          comentario: true,
          respondidaEm: true,
          nome: true,
          email: true,
          company: { select: { id: true, name: true } },
        },
        orderBy: { respondidaEm: 'desc' },
      }),
    ]);
    const notas = respostas.map((r) => r.nota as number);
    const conta = (lista: number[]) => ({
      nps: calcularNps(lista),
      respostas: lista.length,
      promotores: lista.filter((n) => classe(n) === 'PROMOTOR').length,
      neutros: lista.filter((n) => classe(n) === 'NEUTRO').length,
      detratores: lista.filter((n) => classe(n) === 'DETRATOR').length,
    });
    const porTrimestre = new Map<string, number[]>();
    const porEmpresa = new Map<string, { nome: string; notas: number[] }>();
    for (const r of respostas) {
      const t = trimestre(r.respondidaEm as Date);
      porTrimestre.set(t, [...(porTrimestre.get(t) ?? []), r.nota as number]);
      const e = porEmpresa.get(r.company.id) ?? {
        nome: r.company.name,
        notas: [],
      };
      e.notas.push(r.nota as number);
      porEmpresa.set(r.company.id, e);
    }
    return {
      enviadas,
      global: conta(notas),
      porTrimestre: [...porTrimestre.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([t, l]) => ({ trimestre: t, ...conta(l) })),
      porEmpresa: [...porEmpresa.entries()]
        .map(([companyId, e]) => ({
          companyId,
          nome: e.nome,
          ...conta(e.notas),
        }))
        .sort(
          (a, b) => (a.nps ?? 0) - (b.nps ?? 0) || b.respostas - a.respostas,
        ),
      // Detratores primeiro: são os que pedem ação.
      comentarios: respostas
        .filter((r) => r.comentario)
        .slice(0, 200)
        .map((r) => ({
          nota: r.nota as number,
          classe: classe(r.nota as number),
          comentario: r.comentario as string,
          nome: r.nome ?? r.email,
          empresa: r.company.name,
          respondidaEm: (r.respondidaEm as Date).toISOString(),
        }))
        .sort(
          (a, b) =>
            Number(b.classe === 'DETRATOR') - Number(a.classe === 'DETRATOR') ||
            b.respondidaEm.localeCompare(a.respondidaEm),
        ),
    };
  }
}
