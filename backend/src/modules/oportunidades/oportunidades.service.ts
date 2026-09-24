import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  MailboxNotificationKind,
  Prisma,
  UserRole,
  UserStatus,
  type OportunidadeEstagio,
  type OportunidadeMotivoReprova,
  type OportunidadeTipo,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { join } from 'path';

import {
  UPLOAD_MAX_BYTES,
  assertAllowedUpload,
} from '../../common/upload.config';
import { writeUploadedBuffer } from '../../common/upload/local-file.helper';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { getFrontendBaseUrl } from '../auth/password-reset.helper';
import { MailService } from '../mail/mail.service';
import {
  ROTULO_ESTAGIO,
  anoCivil,
  colunaDaReabertura,
  deveFecharSozinho,
  motivoDoAlerta,
  problemaNoMovimento,
  type MotivoAlerta,
} from './oportunidade-regras';

/** Nome da mesa (especialidade) que administra o quadro. */
export const MESA_COMERCIAL = 'Comercial';

/** Papéis que contam como "da Alle" para o aviso de troca de estágio. */
const PAPEIS_INTERNOS: UserRole[] = [
  UserRole.ADMIN,
  UserRole.COLLABORATOR,
  UserRole.PJ,
];

export type Perfil = { admin: boolean; comercial: boolean };

export type FiltrosQuadro = {
  responsavelId?: string;
  solicitante?: string;
  companyId?: string;
  estagios?: OportunidadeEstagio[];
  tipo?: OportunidadeTipo;
  de?: string;
  ate?: string;
  incluirFechados?: boolean;
  busca?: string;
};

export type EdicaoInput = {
  titulo?: string;
  descricao?: string;
  tipo?: OportunidadeTipo | null;
  solicitanteUserId?: string | null;
  solicitanteNome?: string;
  solicitanteEmail?: string | null;
  companyId?: string | null;
  clienteNome?: string | null;
  valorEstimado?: number | null;
  dataRetorno?: string | null;
  responsavelUserId?: string | null;
};

export type MovimentoPedido = {
  para: OportunidadeEstagio;
  tipo?: OportunidadeTipo | null;
  motivoReprova?: OportunidadeMotivoReprova | null;
  motivoReprovaTexto?: string | null;
};

const INCLUDE_CARD = {
  solicitante: { select: { id: true, name: true, email: true } },
  responsavel: { select: { id: true, name: true } },
  company: { select: { id: true, name: true } },
  anexos: {
    include: {
      file: {
        select: { id: true, originalName: true, mimeType: true, size: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.OportunidadeInclude;

type CardRow = Prisma.OportunidadeGetPayload<{ include: typeof INCLUDE_CARD }>;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" como meia-noite de Brasília (UTC-3 o ano todo). */
function inicioDoDia(ymd: string): Date {
  if (!YMD.test(ymd))
    throw new BadRequestException('Data no formato AAAA-MM-DD.');
  return new Date(`${ymd}T00:00:00-03:00`);
}

/** Fim exclusivo do dia: meia-noite do dia seguinte, em Brasília. */
function fimDoDia(ymd: string): Date {
  return new Date(inicioDoDia(ymd).getTime() + 24 * 3600_000);
}

/**
 * HTML, script e SVG passam pela validação geral (ela aceita todo text/ e
 * image/), mas não têm motivo para virar anexo de oportunidade.
 */
export function ehConteudoAtivo(
  mime: string | undefined,
  nome: string | undefined,
): boolean {
  const tipo = (mime ?? '').split(';')[0].trim().toLowerCase();
  const ext = (nome ?? '').toLowerCase().split('.').pop() ?? '';
  return (
    [
      'text/html',
      'application/xhtml+xml',
      'image/svg+xml',
      'text/javascript',
      'application/javascript',
    ].includes(tipo) ||
    ['html', 'htm', 'xhtml', 'svg', 'js', 'mjs'].includes(ext)
  );
}

function escapeHtml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function paraCard(row: CardRow) {
  return {
    id: row.id,
    numero: row.numero,
    titulo: row.titulo,
    descricao: row.descricao,
    estagio: row.estagio,
    estagioAnterior: row.estagioAnterior,
    estagioDesde: row.estagioDesde.toISOString(),
    ultimaMovimentacao: row.ultimaMovimentacao.toISOString(),
    tipo: row.tipo,
    origem: row.origem,
    solicitante: {
      userId: row.solicitanteUserId,
      nome: row.solicitante?.name ?? row.solicitanteNome,
      email: row.solicitante?.email ?? row.solicitanteEmail,
    },
    cliente: row.company
      ? { companyId: row.company.id, nome: row.company.name }
      : row.clienteNome
        ? { companyId: null, nome: row.clienteNome }
        : null,
    responsavel: row.responsavel
      ? { id: row.responsavel.id, nome: row.responsavel.name }
      : null,
    valorEstimado: row.valorEstimado ? Number(row.valorEstimado) : null,
    motivoReprova: row.motivoReprova,
    motivoReprovaTexto: row.motivoReprovaTexto,
    dataRetorno: row.dataRetorno
      ? row.dataRetorno.toISOString().slice(0, 10)
      : null,
    projetoId: row.projetoId,
    chamadoNumero: row.chamadoNumero,
    fechadoEm: row.fechadoEm?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    anexos: row.anexos.map((a) => ({
      id: a.id,
      fileId: a.file.id,
      nome: a.file.originalName,
      mimeType: a.file.mimeType,
      tamanho: a.file.size,
    })),
  };
}

export type Card = ReturnType<typeof paraCard>;

/**
 * Quadro de oportunidades (docs/desenho/OPORTUNIDADES.md).
 *
 * Comercial (quem está na mesa Comercial) e admin administram o quadro. O
 * demais colaborador vê só as oportunidades que ele pediu, sem editar.
 * As regras de movimento moram em oportunidade-regras.ts, puras e testadas.
 */
@Injectable()
export class OportunidadesService {
  private readonly logger = new Logger(OportunidadesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  // --- perfil ----------------------------------------------------------------

  async perfil(actor: AuthenticatedRequestUser): Promise<Perfil> {
    const admin = actor.role === 'ADMIN';
    if (actor.role !== 'ADMIN' && actor.role !== 'COLLABORATOR') {
      return { admin: false, comercial: false };
    }
    const naMesa = await this.prisma.user.count({
      where: {
        id: actor.userId,
        OR: [
          { specialty: { name: MESA_COMERCIAL } },
          {
            userSpecialties: { some: { specialty: { name: MESA_COMERCIAL } } },
          },
        ],
      },
    });
    return { admin, comercial: naMesa > 0 };
  }

  private async exigirGestao(actor: AuthenticatedRequestUser): Promise<Perfil> {
    const p = await this.perfil(actor);
    if (!p.admin && !p.comercial) {
      throw new ForbiddenException(
        'Só o comercial e os administradores alteram oportunidades.',
      );
    }
    return p;
  }

  // --- leitura ---------------------------------------------------------------

  async quadro(actor: AuthenticatedRequestUser, filtros: FiltrosQuadro) {
    const p = await this.perfil(actor);
    const gestao = p.admin || p.comercial;

    const where: Prisma.OportunidadeWhereInput = { deletedAt: null };
    if (!gestao) where.solicitanteUserId = actor.userId;
    if (!filtros.incluirFechados) where.estagio = { not: 'FECHADO' };
    if (filtros.estagios?.length) {
      where.estagio = filtros.incluirFechados
        ? { in: filtros.estagios }
        : { in: filtros.estagios.filter((e) => e !== 'FECHADO') };
    }
    if (gestao && filtros.responsavelId) {
      where.responsavelUserId =
        filtros.responsavelId === 'nenhum' ? null : filtros.responsavelId;
    }
    if (filtros.companyId) where.companyId = filtros.companyId;
    if (filtros.tipo) where.tipo = filtros.tipo;
    if (filtros.de || filtros.ate) {
      where.createdAt = {
        ...(filtros.de ? { gte: inicioDoDia(filtros.de) } : {}),
        ...(filtros.ate ? { lt: fimDoDia(filtros.ate) } : {}),
      };
    }
    const and: Prisma.OportunidadeWhereInput[] = [];
    if (gestao && filtros.solicitante?.trim()) {
      const s = filtros.solicitante.trim();
      const ehId = /^[0-9a-f-]{36}$/i.test(s);
      and.push({
        OR: ehId
          ? [{ solicitanteUserId: s }]
          : [
              { solicitanteNome: { contains: s, mode: 'insensitive' } },
              { solicitanteEmail: { contains: s, mode: 'insensitive' } },
            ],
      });
    }
    if (filtros.busca?.trim()) {
      const b = filtros.busca.trim();
      const numero = Number(b.replace(/^#/, ''));
      and.push({
        OR: [
          { titulo: { contains: b, mode: 'insensitive' } },
          { clienteNome: { contains: b, mode: 'insensitive' } },
          { company: { name: { contains: b, mode: 'insensitive' } } },
          ...(Number.isInteger(numero) && numero > 0 ? [{ numero }] : []),
        ],
      });
    }
    if (and.length) where.AND = and;

    const rows = await this.prisma.oportunidade.findMany({
      where,
      include: INCLUDE_CARD,
      orderBy: [{ estagioDesde: 'asc' }],
      take: 1000,
    });
    return { perfil: p, cards: rows.map(paraCard) };
  }

  async obter(actor: AuthenticatedRequestUser, id: string): Promise<Card> {
    const row = await this.prisma.oportunidade.findFirst({
      where: { id, deletedAt: null },
      include: INCLUDE_CARD,
    });
    if (!row) throw new NotFoundException('Oportunidade não encontrada.');
    const p = await this.perfil(actor);
    if (!p.admin && !p.comercial && row.solicitanteUserId !== actor.userId) {
      throw new ForbiddenException('Você só vê as oportunidades que pediu.');
    }
    return paraCard(row);
  }

  /** Quantas o colaborador trouxe no ano civil (zera em 1º de janeiro). */
  async contador(actor: AuthenticatedRequestUser, agora = new Date()) {
    const { inicio, fim } = anoCivil(agora);
    const total = await this.prisma.oportunidade.count({
      where: {
        deletedAt: null,
        solicitanteUserId: actor.userId,
        createdAt: { gte: inicio, lt: fim },
      },
    });
    return {
      ano: new Date(inicio.getTime() + 12 * 3600_000).getUTCFullYear(),
      total,
    };
  }

  /** Ranking: quem mais traz, quem mais converte e o valor aprovado. */
  async ranking(actor: AuthenticatedRequestUser, de?: string, ate?: string) {
    await this.exigirGestao(actor);
    const periodo =
      de || ate
        ? {
            gte: de ? inicioDoDia(de) : undefined,
            lt: ate ? fimDoDia(ate) : undefined,
          }
        : { gte: anoCivil(new Date()).inicio, lt: anoCivil(new Date()).fim };

    const trazem = await this.prisma.oportunidade.groupBy({
      by: ['solicitanteUserId', 'solicitanteNome'],
      where: { deletedAt: null, createdAt: periodo },
      _count: { _all: true },
    });

    // Aprovação conta pelo evento (quando foi aprovada), não pela criação.
    const aprovacoes = await this.prisma.oportunidadeEvento.findMany({
      where: {
        tipo: 'ESTAGIO',
        para: 'APROVADO',
        createdAt: periodo,
        oportunidade: { deletedAt: null },
      },
      select: {
        oportunidade: {
          select: {
            id: true,
            valorEstimado: true,
            responsavelUserId: true,
            responsavel: { select: { name: true } },
          },
        },
      },
    });
    const porResponsavel = new Map<
      string,
      { nome: string; ids: Set<string>; valor: number }
    >();
    for (const { oportunidade: o } of aprovacoes) {
      if (!o.responsavelUserId) continue;
      const item = porResponsavel.get(o.responsavelUserId) ?? {
        nome: o.responsavel?.name ?? '—',
        ids: new Set<string>(),
        valor: 0,
      };
      // Reaberta e aprovada de novo conta uma vez só.
      if (!item.ids.has(o.id)) {
        item.ids.add(o.id);
        item.valor += o.valorEstimado ? Number(o.valorEstimado) : 0;
      }
      porResponsavel.set(o.responsavelUserId, item);
    }

    const nomes = await this.prisma.user.findMany({
      where: {
        id: {
          in: trazem
            .map((t) => t.solicitanteUserId)
            .filter((id): id is string => Boolean(id)),
        },
      },
      select: { id: true, name: true },
    });
    const nomePorId = new Map(nomes.map((u) => [u.id, u.name]));

    return {
      periodo: {
        de: periodo.gte?.toISOString() ?? null,
        ate: periodo.lt?.toISOString() ?? null,
      },
      trazem: trazem
        .map((t) => ({
          userId: t.solicitanteUserId,
          nome:
            (t.solicitanteUserId && nomePorId.get(t.solicitanteUserId)) ||
            t.solicitanteNome,
          total: t._count._all,
        }))
        .sort((a, b) => b.total - a.total),
      convertem: [...porResponsavel.entries()]
        .map(([userId, v]) => ({
          userId,
          nome: v.nome,
          aprovadas: v.ids.size,
          valorAprovado: Math.round(v.valor * 100) / 100,
        }))
        .sort(
          (a, b) =>
            b.aprovadas - a.aprovadas || b.valorAprovado - a.valorAprovado,
        ),
    };
  }

  /** Pessoas que podem ser responsáveis (comercial e admins ativos). */
  async responsaveisPossiveis(actor: AuthenticatedRequestUser) {
    await this.exigirGestao(actor);
    return this.prisma.user.findMany({
      where: {
        deletedAt: null,
        status: UserStatus.ACTIVE,
        OR: [
          { role: UserRole.ADMIN },
          { specialty: { name: MESA_COMERCIAL } },
          {
            userSpecialties: { some: { specialty: { name: MESA_COMERCIAL } } },
          },
        ],
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  /** Clientes cadastrados, para o filtro e para o campo Cliente. */
  async clientes(actor: AuthenticatedRequestUser) {
    await this.exigirGestao(actor);
    return this.prisma.company.findMany({
      where: { deletedAt: null, status: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  /** Equipe interna ativa, para trocar o solicitante. */
  async pessoas(actor: AuthenticatedRequestUser) {
    await this.exigirGestao(actor);
    return this.prisma.user.findMany({
      where: {
        deletedAt: null,
        status: UserStatus.ACTIVE,
        role: { in: [UserRole.ADMIN, UserRole.COLLABORATOR] },
      },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    });
  }

  // --- criação ---------------------------------------------------------------

  /** Qualquer colaborador registra uma oportunidade pelo portal. */
  async criarPeloPortal(
    actor: AuthenticatedRequestUser,
    dados: { titulo: string; descricao?: string },
    arquivos: Express.Multer.File[] = [],
  ): Promise<Card> {
    if (actor.role !== 'ADMIN' && actor.role !== 'COLLABORATOR') {
      throw new ForbiddenException('Só a equipe registra oportunidades.');
    }
    const titulo = dados.titulo?.trim();
    if (!titulo) throw new BadRequestException('Informe o título.');
    for (const f of arquivos) this.validarArquivo(f);

    const eu = await this.prisma.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: { name: true, email: true },
    });
    const criado = await this.prisma.oportunidade.create({
      data: {
        titulo: titulo.slice(0, 200),
        descricao: (dados.descricao ?? '').trim(),
        origem: 'PORTAL',
        solicitanteUserId: actor.userId,
        solicitanteNome: eu.name,
        solicitanteEmail: eu.email,
        createdBy: actor.userId,
        eventos: {
          create: { tipo: 'CRIADA', para: 'PENDENTE', userId: actor.userId },
        },
      },
    });
    for (const f of arquivos) {
      await this.guardarArquivo(
        criado.id,
        actor.userId,
        f.originalname,
        f.mimetype,
        f.buffer,
      );
    }
    const card = await this.obterSemChecar(criado.id);
    await this.avisarComercialNova(card);
    return card;
  }

  // --- alterações --------------------------------------------------------------

  async editar(
    actor: AuthenticatedRequestUser,
    id: string,
    dados: EdicaoInput,
  ): Promise<Card> {
    await this.exigirGestao(actor);
    const atual = await this.exigirCard(id);

    const data: Prisma.OportunidadeUncheckedUpdateInput = {
      ultimaMovimentacao: new Date(),
    };
    if (dados.titulo !== undefined) {
      const t = dados.titulo.trim();
      if (!t) throw new BadRequestException('O título não pode ficar vazio.');
      data.titulo = t.slice(0, 200);
    }
    if (dados.descricao !== undefined) data.descricao = dados.descricao.trim();
    if (dados.tipo !== undefined) {
      if (!dados.tipo && atual.estagio !== 'PENDENTE') {
        throw new BadRequestException(
          'Fora de Pendente, o tipo é obrigatório.',
        );
      }
      data.tipo = dados.tipo;
    }
    if (dados.solicitanteUserId !== undefined) {
      if (dados.solicitanteUserId) {
        const u = await this.prisma.user.findFirst({
          where: { id: dados.solicitanteUserId, deletedAt: null },
          select: { id: true, name: true, email: true },
        });
        if (!u) throw new BadRequestException('Solicitante não encontrado.');
        data.solicitanteUserId = u.id;
        data.solicitanteNome = u.name;
        data.solicitanteEmail = u.email;
      } else {
        const nome = dados.solicitanteNome?.trim();
        if (!nome)
          throw new BadRequestException('Informe o nome do solicitante.');
        data.solicitanteUserId = null;
        data.solicitanteNome = nome.slice(0, 200);
        data.solicitanteEmail =
          dados.solicitanteEmail?.trim().toLowerCase() || null;
      }
    }
    if (dados.companyId !== undefined || dados.clienteNome !== undefined) {
      if (dados.companyId) {
        const c = await this.prisma.company.findFirst({
          where: { id: dados.companyId, deletedAt: null },
          select: { id: true },
        });
        if (!c) throw new BadRequestException('Cliente não encontrado.');
        data.companyId = c.id;
        data.clienteNome = null;
      } else {
        data.companyId = null;
        data.clienteNome = dados.clienteNome?.trim().slice(0, 200) || null;
      }
    }
    if (dados.valorEstimado !== undefined) {
      if (
        dados.valorEstimado !== null &&
        (dados.valorEstimado < 0 || !Number.isFinite(dados.valorEstimado))
      ) {
        throw new BadRequestException('Valor estimado inválido.');
      }
      data.valorEstimado =
        dados.valorEstimado === null
          ? null
          : new Prisma.Decimal(dados.valorEstimado.toFixed(2));
    }
    if (dados.dataRetorno !== undefined) {
      data.dataRetorno = dados.dataRetorno
        ? new Date(`${dados.dataRetorno}T12:00:00Z`)
        : null;
      data.retornoAvisadoEm = null;
    }

    const eventos: Prisma.OportunidadeEventoCreateManyInput[] = [];
    if (
      dados.responsavelUserId !== undefined &&
      dados.responsavelUserId !== atual.responsavelUserId
    ) {
      if (dados.responsavelUserId) {
        const possiveis = await this.responsaveisPossiveis(actor);
        if (!possiveis.some((p) => p.id === dados.responsavelUserId)) {
          throw new BadRequestException(
            'O responsável precisa ser do comercial ou administrador.',
          );
        }
      } else if (atual.estagio !== 'PENDENTE') {
        throw new BadRequestException(
          'Fora de Pendente, o card precisa de responsável.',
        );
      }
      data.responsavelUserId = dados.responsavelUserId;
      eventos.push({
        oportunidadeId: id,
        tipo: 'RESPONSAVEL',
        de: atual.responsavelUserId,
        para: dados.responsavelUserId,
        userId: actor.userId,
      });
    }
    eventos.push({ oportunidadeId: id, tipo: 'EDITADA', userId: actor.userId });

    await this.prisma.$transaction([
      this.prisma.oportunidade.update({ where: { id }, data }),
      this.prisma.oportunidadeEvento.createMany({ data: eventos }),
    ]);
    return this.obterSemChecar(id);
  }

  async mover(
    actor: AuthenticatedRequestUser,
    id: string,
    pedido: MovimentoPedido,
  ): Promise<Card> {
    await this.exigirGestao(actor);
    const atual = await this.exigirCard(id);
    const tipo = pedido.tipo ?? atual.tipo;
    const problema = problemaNoMovimento({
      atual: atual.estagio,
      para: pedido.para,
      tipo,
      motivoReprova: pedido.motivoReprova ?? null,
      motivoReprovaTexto: pedido.motivoReprovaTexto ?? null,
    });
    if (problema) throw new BadRequestException(problema);

    const agora = new Date();
    const data: Prisma.OportunidadeUncheckedUpdateInput = {
      estagio: pedido.para,
      estagioDesde: agora,
      ultimaMovimentacao: agora,
      alertaEnviadoEm: null,
      tipo,
    };
    // Quem tira de Pendente vira o responsável.
    if (atual.estagio === 'PENDENTE' && !atual.responsavelUserId) {
      data.responsavelUserId = actor.userId;
    }
    if (pedido.para === 'REPROVADO') {
      data.motivoReprova = pedido.motivoReprova;
      data.motivoReprovaTexto =
        pedido.motivoReprovaTexto?.trim().slice(0, 500) || null;
    }
    if (pedido.para === 'FECHADO') {
      data.estagioAnterior = atual.estagio;
      data.fechadoEm = agora;
    }

    // Atualização condicionada ao estágio lido: dois comerciais movendo o
    // mesmo card ao mesmo tempo não viram duas trocas.
    const r = await this.prisma.oportunidade.updateMany({
      where: { id, estagio: atual.estagio, deletedAt: null },
      data: data as Prisma.OportunidadeUncheckedUpdateManyInput,
    });
    if (r.count === 0) {
      throw new BadRequestException(
        'O card mudou enquanto você mexia. Recarregue o quadro.',
      );
    }
    await this.prisma.oportunidadeEvento.createMany({
      data: [
        {
          oportunidadeId: id,
          tipo: 'ESTAGIO',
          de: atual.estagio,
          para: pedido.para,
          userId: actor.userId,
        },
        ...(data.responsavelUserId
          ? [
              {
                oportunidadeId: id,
                tipo: 'RESPONSAVEL',
                de: null,
                para: actor.userId,
                userId: actor.userId,
              },
            ]
          : []),
      ],
    });

    const card = await this.obterSemChecar(id);
    if (pedido.para !== 'FECHADO') {
      await this.avisarSolicitante(
        card,
        `mudou para "${ROTULO_ESTAGIO[pedido.para]}"`,
      );
    }
    return card;
  }

  async reabrir(actor: AuthenticatedRequestUser, id: string): Promise<Card> {
    const p = await this.perfil(actor);
    const atual = await this.exigirCard(id);
    const responsavel = atual.responsavelUserId === actor.userId;
    if (!p.admin && !p.comercial && !responsavel) {
      throw new ForbiddenException(
        'Só o responsável, o comercial e os administradores reabrem.',
      );
    }
    if (atual.estagio !== 'FECHADO') {
      throw new BadRequestException('Só dá para reabrir um card fechado.');
    }
    const para = colunaDaReabertura(atual.estagioAnterior);
    const agora = new Date();
    await this.prisma.$transaction([
      this.prisma.oportunidade.update({
        where: { id },
        // O prazo de 2 dias recomeça na reabertura.
        data: {
          estagio: para,
          estagioDesde: agora,
          ultimaMovimentacao: agora,
          fechadoEm: null,
        },
      }),
      this.prisma.oportunidadeEvento.create({
        data: {
          oportunidadeId: id,
          tipo: 'REABERTA',
          de: 'FECHADO',
          para,
          userId: actor.userId,
        },
      }),
    ]);
    const card = await this.obterSemChecar(id);
    // Reabrir não manda "troca de estágio": só avisa que foi reaberto.
    await this.avisarSolicitante(card, 'foi reaberta');
    return card;
  }

  /** Só admin apaga; o card sai do quadro mas fica no banco. */
  async apagar(actor: AuthenticatedRequestUser, id: string) {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenException('Só administradores apagam oportunidades.');
    }
    await this.exigirCard(id);
    await this.prisma.$transaction([
      this.prisma.oportunidade.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: actor.userId },
      }),
      this.prisma.oportunidadeEvento.create({
        data: { oportunidadeId: id, tipo: 'APAGADA', userId: actor.userId },
      }),
    ]);
    return { ok: true as const };
  }

  async anexar(
    actor: AuthenticatedRequestUser,
    id: string,
    arquivos: Express.Multer.File[],
  ) {
    await this.exigirGestao(actor);
    await this.exigirCard(id);
    if (!arquivos.length)
      throw new BadRequestException('Nenhum arquivo enviado.');
    for (const f of arquivos) this.validarArquivo(f);
    for (const f of arquivos) {
      await this.guardarArquivo(
        id,
        actor.userId,
        f.originalname,
        f.mimetype,
        f.buffer,
      );
    }
    await this.prisma.oportunidade.update({
      where: { id },
      data: { ultimaMovimentacao: new Date() },
    });
    return this.obterSemChecar(id);
  }

  async removerAnexo(
    actor: AuthenticatedRequestUser,
    id: string,
    anexoId: string,
  ) {
    await this.exigirGestao(actor);
    const r = await this.prisma.oportunidadeAnexo.deleteMany({
      where: { id: anexoId, oportunidadeId: id },
    });
    if (r.count === 0) throw new NotFoundException('Anexo não encontrado.');
    return this.obterSemChecar(id);
  }

  /** Arquivo de um anexo, para quem pode ver o card. */
  async arquivoDoAnexo(
    actor: AuthenticatedRequestUser,
    id: string,
    anexoId: string,
  ) {
    await this.obter(actor, id);
    const anexo = await this.prisma.oportunidadeAnexo.findFirst({
      where: { id: anexoId, oportunidadeId: id },
      include: { file: true },
    });
    if (!anexo) throw new NotFoundException('Anexo não encontrado.');
    return anexo.file;
  }

  // --- rotinas (jobs) ------------------------------------------------------------

  /** Aprovado/Reprovado há 2 dias corridos: vai para Fechado. */
  async fecharVencidos(agora = new Date()): Promise<number> {
    const candidatos = await this.prisma.oportunidade.findMany({
      where: { deletedAt: null, estagio: { in: ['APROVADO', 'REPROVADO'] } },
      select: { id: true, estagio: true, estagioDesde: true },
    });
    let fechados = 0;
    for (const c of candidatos) {
      if (!deveFecharSozinho(c, agora)) continue;
      const r = await this.prisma.oportunidade.updateMany({
        where: { id: c.id, estagio: c.estagio },
        data: {
          estagio: 'FECHADO',
          estagioAnterior: c.estagio,
          estagioDesde: agora,
          fechadoEm: agora,
        },
      });
      if (r.count) {
        fechados += 1;
        await this.prisma.oportunidadeEvento.create({
          data: {
            oportunidadeId: c.id,
            tipo: 'ESTAGIO',
            de: c.estagio,
            para: 'FECHADO',
          },
        });
      }
    }
    return fechados;
  }

  /** 15 dias em Pendente ou 1 mês parado: avisa o comercial (semanal). */
  async alertarParados(agora = new Date()): Promise<number> {
    const cards = await this.prisma.oportunidade.findMany({
      where: {
        deletedAt: null,
        estagio: {
          in: ['PENDENTE', 'EM_ANALISE', 'PROPOSTA', 'AGUARDO_CLIENTE'],
        },
      },
      include: INCLUDE_CARD,
    });
    const alertas: Array<{ card: Card; motivo: MotivoAlerta }> = [];
    for (const row of cards) {
      const motivo = motivoDoAlerta(row, agora);
      if (motivo) alertas.push({ card: paraCard(row), motivo });
    }
    if (!alertas.length) return 0;

    const comercial = await this.pessoasDoComercial();
    for (const { card, motivo } of alertas) {
      const porque =
        motivo === 'PENDENTE_15_DIAS'
          ? 'está em Pendente há 15 dias ou mais'
          : 'está sem nenhuma alteração há 1 mês ou mais';
      await this.enviar(
        comercial.map((p) => p.email),
        `Oportunidade #${card.numero} parada — ${card.titulo}`,
        `A oportunidade #${card.numero} (${card.titulo}) ${porque}.`,
        card,
      );
      await this.notificar(
        comercial.map((p) => p.id),
        MailboxNotificationKind.OPORTUNIDADE_ALERTA,
        `Oportunidade #${card.numero} parada`,
        `"${card.titulo}" ${porque}.`,
        `oportunidade-alerta:${card.id}:${agora.toISOString().slice(0, 10)}`,
      );
      await this.prisma.oportunidade.update({
        where: { id: card.id },
        data: { alertaEnviadoEm: agora },
      });
    }
    return alertas.length;
  }

  /** Data de retorno vencida em Aguardo cliente: lembra o responsável. */
  async lembrarRetornos(agora = new Date()): Promise<number> {
    const hoje = new Date(
      `${new Date(agora.getTime() - 3 * 3600_000).toISOString().slice(0, 10)}T12:00:00Z`,
    );
    const cards = await this.prisma.oportunidade.findMany({
      where: {
        deletedAt: null,
        estagio: 'AGUARDO_CLIENTE',
        dataRetorno: { lte: hoje },
        retornoAvisadoEm: null,
        responsavelUserId: { not: null },
      },
      include: {
        ...INCLUDE_CARD,
        responsavel: { select: { id: true, name: true, email: true } },
      },
    });
    for (const row of cards) {
      const card = paraCard(row);
      await this.enviar(
        [row.responsavel!.email],
        `Retorno do cliente — oportunidade #${card.numero}`,
        `Hoje é o dia combinado para cobrar o retorno da oportunidade #${card.numero} (${card.titulo}).`,
        card,
      );
      await this.notificar(
        [row.responsavel!.id],
        MailboxNotificationKind.OPORTUNIDADE_RETORNO,
        `Cobrar retorno: oportunidade #${card.numero}`,
        `"${card.titulo}" está aguardando o cliente desde a data combinada.`,
        `oportunidade-retorno:${card.id}:${card.dataRetorno}`,
      );
      await this.prisma.oportunidade.update({
        where: { id: row.id },
        data: { retornoAvisadoEm: agora },
      });
    }
    return cards.length;
  }

  // --- configuração ---------------------------------------------------------------

  async config() {
    return this.prisma.oportunidadeConfig.upsert({
      where: { id: 'default' },
      create: { id: 'default' },
      update: {},
      select: {
        caixaEmail: true,
        leituraAtiva: true,
        avisarSolicitanteExterno: true,
        ultimaLeituraEm: true,
      },
    });
  }

  async salvarConfig(dados: {
    caixaEmail?: string | null;
    leituraAtiva?: boolean;
    avisarSolicitanteExterno?: boolean;
  }) {
    const caixa = dados.caixaEmail?.trim().toLowerCase() || null;
    if (caixa && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(caixa)) {
      throw new BadRequestException('Endereço da caixa inválido.');
    }
    if (dados.leituraAtiva && !caixa) {
      throw new BadRequestException(
        'Informe a caixa antes de ligar a leitura.',
      );
    }
    const atual = await this.prisma.oportunidadeConfig.findUnique({
      where: { id: 'default' },
    });
    // Ligar a leitura marca o corte: e-mail antigo da caixa não vira card.
    const ligando = Boolean(dados.leituraAtiva) && !atual?.leituraAtiva;
    await this.prisma.oportunidadeConfig.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        caixaEmail: caixa,
        leituraAtiva: Boolean(dados.leituraAtiva),
        leituraDesde: ligando ? new Date() : null,
        avisarSolicitanteExterno: Boolean(dados.avisarSolicitanteExterno),
      },
      update: {
        ...(dados.caixaEmail !== undefined
          ? { caixaEmail: caixa, deltaLink: null }
          : {}),
        ...(dados.leituraAtiva !== undefined
          ? { leituraAtiva: dados.leituraAtiva }
          : {}),
        ...(ligando ? { leituraDesde: new Date() } : {}),
        ...(dados.avisarSolicitanteExterno !== undefined
          ? { avisarSolicitanteExterno: dados.avisarSolicitanteExterno }
          : {}),
      },
    });
    return this.config();
  }

  // --- internos ------------------------------------------------------------------

  private async exigirCard(id: string) {
    const row = await this.prisma.oportunidade.findFirst({
      where: { id, deletedAt: null },
    });
    if (!row) throw new NotFoundException('Oportunidade não encontrada.');
    return row;
  }

  /** Card completo para montar aviso (uso interno: leitor de e-mail). */
  obterParaAviso(id: string): Promise<Card> {
    return this.obterSemChecar(id);
  }

  private async obterSemChecar(id: string): Promise<Card> {
    const row = await this.prisma.oportunidade.findUniqueOrThrow({
      where: { id },
      include: INCLUDE_CARD,
    });
    return paraCard(row);
  }

  private validarArquivo(f: Express.Multer.File) {
    if (f.size > UPLOAD_MAX_BYTES) {
      throw new BadRequestException(`"${f.originalname}" passa de 10 MB.`);
    }
    if (ehConteudoAtivo(f.mimetype, f.originalname)) {
      throw new BadRequestException(
        `"${f.originalname}": página, script ou SVG não são aceitos como anexo.`,
      );
    }
    assertAllowedUpload(f);
  }

  /** Grava o arquivo e liga ao card. Usado pelo portal e pelo e-mail. */
  async guardarArquivo(
    oportunidadeId: string,
    uploadedBy: string,
    nome: string,
    mimeType: string,
    buffer: Buffer,
  ) {
    const seguro =
      nome.replace(/[^\w.\-() ]+/g, '_').slice(0, 150) || 'arquivo';
    const destino = join(
      process.cwd(),
      'uploads',
      'oportunidades',
      oportunidadeId,
      `${randomUUID()}-${seguro}`,
    );
    await writeUploadedBuffer(destino, buffer);
    const file = await this.prisma.file.create({
      data: {
        originalName: nome.slice(0, 255),
        mimeType,
        path: destino,
        size: buffer.length,
        uploadedBy,
      },
    });
    await this.prisma.oportunidadeAnexo.create({
      data: { oportunidadeId, fileId: file.id },
    });
  }

  async pessoasDoComercial() {
    return this.prisma.user.findMany({
      where: {
        deletedAt: null,
        status: UserStatus.ACTIVE,
        OR: [
          { specialty: { name: MESA_COMERCIAL } },
          {
            userSpecialties: { some: { specialty: { name: MESA_COMERCIAL } } },
          },
        ],
      },
      select: { id: true, name: true, email: true },
    });
  }

  /** Card novo em Pendente: e-mail e Correio para o comercial. */
  async avisarComercialNova(card: Card) {
    const comercial = await this.pessoasDoComercial();
    if (!comercial.length) {
      this.logger.warn(
        `Oportunidade #${card.numero} criada, mas ninguém está na mesa Comercial.`,
      );
      return;
    }
    await this.enviar(
      comercial.map((p) => p.email),
      `Nova oportunidade #${card.numero} — ${card.titulo}`,
      `Nova oportunidade em Pendente, registrada por ${card.solicitante.nome}.`,
      card,
    );
    await this.notificar(
      comercial.map((p) => p.id),
      MailboxNotificationKind.OPORTUNIDADE_NOVA,
      `Nova oportunidade #${card.numero}`,
      `"${card.titulo}", de ${card.solicitante.nome}.`,
      `oportunidade-nova:${card.id}`,
    );
  }

  /**
   * Avisa o solicitante. Interno (usuário da equipe) sempre; externo só se a
   * chave "avisar solicitante externo" estiver ligada no admin.
   */
  private async avisarSolicitante(card: Card, oQueAconteceu: string) {
    const email = card.solicitante.email;
    if (!email) return;
    let interno = false;
    if (card.solicitante.userId) {
      const u = await this.prisma.user.findUnique({
        where: { id: card.solicitante.userId },
        select: { role: true },
      });
      interno = Boolean(u && PAPEIS_INTERNOS.includes(u.role));
    }
    if (!interno) {
      const cfg = await this.config();
      if (!cfg.avisarSolicitanteExterno) return;
    }
    await this.enviar(
      [email],
      `Oportunidade #${card.numero} ${oQueAconteceu} — ${card.titulo}`,
      `A oportunidade #${card.numero} (${card.titulo}) ${oQueAconteceu}.`,
      card,
      interno,
    );
    if (interno && card.solicitante.userId) {
      await this.notificar(
        [card.solicitante.userId],
        MailboxNotificationKind.OPORTUNIDADE_ESTAGIO,
        `Oportunidade #${card.numero} ${oQueAconteceu}`,
        card.titulo,
        `oportunidade-estagio:${card.id}:${card.estagio}:${Date.now()}`,
      );
    }
  }

  private async enviar(
    para: string[],
    assunto: string,
    texto: string,
    card: Card,
    comLink = true,
  ) {
    const destinos = [...new Set(para.filter(Boolean))];
    if (!destinos.length) return;
    const link = `${getFrontendBaseUrl()}/oportunidades?card=${card.id}`;
    try {
      // Resposta ao aviso volta para a caixa de oportunidades (e entra no
      // card), não para a caixa de chamados, que a transformaria em pré-ticket.
      const caixa = (
        await this.prisma.oportunidadeConfig.findUnique({
          where: { id: 'default' },
          select: { caixaEmail: true },
        })
      )?.caixaEmail;
      await this.mail.sendMail({
        to: destinos,
        ...(caixa ? { replyTo: caixa } : {}),
        subject: assunto,
        text: `${texto}\n\nEstágio: ${ROTULO_ESTAGIO[card.estagio]}${comLink ? `\n${link}` : ''}\n\nAlle Tecnologia`,
        html: `<p>${escapeHtml(texto)}</p><p>Estágio: <strong>${escapeHtml(ROTULO_ESTAGIO[card.estagio])}</strong></p>${
          comLink
            ? `<p><a href="${escapeHtml(link)}">Abrir no portal</a></p>`
            : ''
        }<p>Alle Tecnologia</p>`,
      });
    } catch (err) {
      // E-mail é aviso: a mudança no card já foi gravada.
      this.logger.warn(
        `Aviso da oportunidade #${card.numero} não enviado: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async notificar(
    userIds: string[],
    kind: MailboxNotificationKind,
    title: string,
    body: string,
    dedupe: string,
  ) {
    for (const userId of new Set(userIds)) {
      await this.prisma.mailboxNotification
        .upsert({
          where: { userId_dedupeKey: { userId, dedupeKey: dedupe } },
          create: {
            userId,
            kind,
            title: title.slice(0, 200),
            body: body.slice(0, 500),
            href: '/oportunidades',
            dedupeKey: dedupe,
          },
          update: {},
        })
        .catch((err: unknown) =>
          this.logger.warn(
            `Aviso no Correio falhou (${dedupe}): ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
    }
  }
}
