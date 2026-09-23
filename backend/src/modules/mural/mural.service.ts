import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  MailboxNotificationKind,
  UserRole,
  UserStatus,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

/** Cores de papel oferecidas na tela. Qualquer outra vira a padrão. */
export const MURAL_CORES = [
  'amarelo',
  'rosa',
  'verde',
  'azul',
  'lilas',
  'laranja',
] as const;
export type MuralCor = (typeof MURAL_CORES)[number];
export const MURAL_COR_PADRAO: MuralCor = 'amarelo';

/** Reações oferecidas. Poucas de propósito: é um clique, não um teclado. */
export const MURAL_REACOES = ['👏', '❤️', '😄', '🙌'] as const;
export type MuralReacao = (typeof MURAL_REACOES)[number];

export type MuralNoteDto = {
  id: string;
  message: string;
  color: string;
  x: number;
  y: number;
  rotation: number;
  anonymous: boolean;
  /** Null quando o bilhete é anônimo — nem admin recebe o autor por aqui. */
  authorName: string | null;
  toName: string | null;
  createdAt: string;
  /** Quem está vendo escreveu este bilhete (pode editar e mover). */
  mine: boolean;
  /** Quem está vendo pode tirar o bilhete do mural. */
  canDelete: boolean;
  /** Quantas pessoas deram cada reação, só as que têm pelo menos uma. */
  reactions: Array<{ emoji: string; count: number; mine: boolean }>;
  /** Chegou depois da última vez que esta pessoa abriu o mural. */
  isNew: boolean;
};

type Actor = { userId: string; role: UserRole };

function clamp01(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function normalizarCor(cor: string | undefined): string {
  const limpa = cor?.trim().toLowerCase();
  return MURAL_CORES.includes(limpa as MuralCor)
    ? (limpa as string)
    : MURAL_COR_PADRAO;
}

/**
 * Agrupa as reações por emoji, preservando a ordem da lista oferecida, e
 * marca quais a própria pessoa deu. Emoji sem ninguém não aparece.
 */
function contarReacoes(
  reactions: Array<{ emoji: string; userId: string }>,
  userId: string,
): Array<{ emoji: string; count: number; mine: boolean }> {
  return MURAL_REACOES.map((emoji) => {
    const doEmoji = reactions.filter((r) => r.emoji === emoji);
    return {
      emoji: emoji as string,
      count: doEmoji.length,
      mine: doEmoji.some((r) => r.userId === userId),
    };
  }).filter((item) => item.count > 0);
}

/** Inclinação leve; papel pregado perfeitamente reto não parece papel. */
function inclinacao(rotation: number | undefined): number {
  if (typeof rotation !== 'number' || !Number.isFinite(rotation)) {
    return Math.round((Math.random() * 8 - 4) * 10) / 10;
  }
  return Math.min(10, Math.max(-10, rotation));
}

/**
 * Mural de reconhecimento: bilhetes que a equipe interna prega para a equipe
 * interna.
 *
 * Anonimato: o autor é sempre gravado (é o rastro se alguém abusar), mas um
 * bilhete anônimo nunca sai daqui com o nome — nem para admin. Quem decide o
 * que a tela mostra é este serviço, não o front.
 */
@Injectable()
export class MuralService {
  private readonly logger = new Logger(MuralService.name);

  constructor(private readonly prisma: PrismaService) {}

  private mapear(
    note: {
      id: string;
      message: string;
      color: string;
      x: number;
      y: number;
      rotation: number;
      anonymous: boolean;
      authorUserId: string;
      createdAt: Date;
      author: { name: string } | null;
      recipient: { name: string } | null;
      reactions?: Array<{ emoji: string; userId: string }>;
    },
    actor: Actor,
    vistoEm?: Date | null,
  ): MuralNoteDto {
    const mine = note.authorUserId === actor.userId;
    return {
      id: note.id,
      message: note.message,
      color: note.color,
      x: note.x,
      y: note.y,
      rotation: note.rotation,
      anonymous: note.anonymous,
      // O nome do autor só acompanha bilhete assinado. Em bilhete anônimo
      // ninguém recebe o nome — a tela não teria como vazar o que não tem.
      authorName: note.anonymous ? null : (note.author?.name ?? null),
      toName: note.recipient?.name ?? null,
      createdAt: note.createdAt.toISOString(),
      mine,
      canDelete: mine || actor.role === UserRole.ADMIN,
      reactions: contarReacoes(note.reactions ?? [], actor.userId),
      // Sem visita registrada nada é novidade: a primeira abertura não pode
      // acender o mural inteiro.
      isNew: Boolean(vistoEm && note.createdAt > vistoEm && !mine),
    };
  }

  /** Colegas que podem receber bilhete: equipe interna ativa. */
  async colegas(): Promise<Array<{ id: string; name: string }>> {
    return this.prisma.user.findMany({
      where: {
        deletedAt: null,
        status: UserStatus.ACTIVE,
        role: { in: [UserRole.ADMIN, UserRole.COLLABORATOR] },
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Lista o mural e, no mesmo passo, marca a visita.
   *
   * O destaque do que é novo sai da visita ANTERIOR — por isso ela é lida
   * antes de ser atualizada. Sem isso a pessoa nunca veria novidade: a
   * própria abertura já teria zerado a conta.
   */
  async listar(actor: Actor): Promise<MuralNoteDto[]> {
    const visita = await this.prisma.muralVisit.findUnique({
      where: { userId: actor.userId },
    });
    const notes = await this.prisma.muralNote.findMany({
      where: { deletedAt: null },
      include: {
        author: { select: { name: true } },
        recipient: { select: { name: true } },
        reactions: { select: { emoji: true, userId: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const agora = new Date();
    await this.prisma.muralVisit.upsert({
      where: { userId: actor.userId },
      create: { userId: actor.userId, seenAt: agora },
      update: { seenAt: agora },
    });
    return notes.map((note) => this.mapear(note, actor, visita?.seenAt ?? null));
  }

  async criar(
    actor: Actor,
    data: {
      message: string;
      color?: string;
      toUserId?: string | null;
      anonymous?: boolean;
      x?: number;
      y?: number;
      rotation?: number;
    },
  ): Promise<MuralNoteDto> {
    const note = await this.prisma.muralNote.create({
      data: {
        authorUserId: actor.userId,
        anonymous: data.anonymous ?? false,
        toUserId: data.toUserId?.trim() || null,
        message: data.message.trim(),
        color: normalizarCor(data.color),
        x: clamp01(data.x, 0.5),
        y: clamp01(data.y, 0.5),
        rotation: inclinacao(data.rotation),
      },
      include: {
        author: { select: { name: true } },
        recipient: { select: { name: true } },
        reactions: { select: { emoji: true, userId: true } },
      },
    });
    await this.avisarDestinatario(note.id, note.toUserId, actor.userId);
    return this.mapear(note, actor);
  }

  /**
   * Avisa no correio quem recebeu o bilhete.
   *
   * Nunca falha a criação do bilhete: o recado já está na parede, e perder
   * o aviso é menos grave do que perder o bilhete. Bilhete anônimo avisa sem
   * dizer de quem é — e ninguém recebe aviso de bilhete escrito por si.
   */
  private async avisarDestinatario(
    noteId: string,
    toUserId: string | null,
    authorUserId: string,
  ): Promise<void> {
    if (!toUserId || toUserId === authorUserId) return;
    try {
      await this.prisma.mailboxNotification.create({
        data: {
          userId: toUserId,
          kind: MailboxNotificationKind.MURAL_NOTE_RECEIVED,
          title: 'Você recebeu um bilhete no mural',
          body: 'Alguém deixou um recado para você no mural da equipe.',
          href: '/mural',
          // Um aviso por bilhete: reabrir a tela não repete o recado.
          dedupeKey: `mural:${noteId}`,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Bilhete ${noteId} criado, mas o aviso no correio falhou: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Mural do mês: quem mais foi lembrado no período.
   *
   * Conta bilhetes recebidos, não escritos — a pergunta é quem o time andou
   * reconhecendo. Bilhete sem destinatário não entra, e bilhete anônimo
   * entra igual: o anonimato protege quem escreveu, não quem recebeu.
   */
  async doMes(mes?: string): Promise<{
    mes: string;
    ranking: Array<{ name: string; total: number }>;
    total: number;
  }> {
    const base = /^d{4}-d{2}$/.test(mes ?? '')
      ? new Date(`${mes}-01T12:00:00.000Z`)
      : new Date();
    const inicio = new Date(base.getFullYear(), base.getMonth(), 1);
    const fim = new Date(base.getFullYear(), base.getMonth() + 1, 1);

    const notes = await this.prisma.muralNote.findMany({
      where: {
        deletedAt: null,
        toUserId: { not: null },
        createdAt: { gte: inicio, lt: fim },
      },
      select: { recipient: { select: { name: true } } },
    });

    const porPessoa = new Map<string, number>();
    for (const note of notes) {
      const nome = note.recipient?.name;
      if (!nome) continue;
      porPessoa.set(nome, (porPessoa.get(nome) ?? 0) + 1);
    }

    const ranking = [...porPessoa.entries()]
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

    const mm = String(inicio.getMonth() + 1).padStart(2, '0');
    return {
      mes: `${inicio.getFullYear()}-${mm}`,
      ranking,
      total: notes.length,
    };
  }

  /**
   * Liga ou desliga a reação de quem clicou. O mesmo clique de novo desfaz,
   * que é o que a pessoa espera de um botão que fica aceso.
   */
  async reagir(
    actor: Actor,
    id: string,
    emoji: string,
  ): Promise<MuralNoteDto> {
    const nota = await this.prisma.muralNote.findFirst({
      where: { id, deletedAt: null },
    });
    if (!nota) throw new NotFoundException('Bilhete não encontrado.');

    const existente = await this.prisma.muralNoteReaction.findUnique({
      where: { noteId_userId_emoji: { noteId: id, userId: actor.userId, emoji } },
    });
    if (existente) {
      await this.prisma.muralNoteReaction.delete({
        where: { id: existente.id },
      });
    } else {
      await this.prisma.muralNoteReaction.create({
        data: { noteId: id, userId: actor.userId, emoji },
      });
    }

    const atualizada = await this.prisma.muralNote.findUniqueOrThrow({
      where: { id },
      include: {
        author: { select: { name: true } },
        recipient: { select: { name: true } },
        reactions: { select: { emoji: true, userId: true } },
      },
    });
    return this.mapear(atualizada, actor);
  }

  /**
   * Só o autor edita o próprio bilhete — inclusive para arrastar de lugar.
   * Admin remove, mas não reescreve o que outra pessoa escreveu.
   */
  async atualizar(
    actor: Actor,
    id: string,
    data: {
      message?: string;
      color?: string;
      toUserId?: string | null;
      anonymous?: boolean;
      x?: number;
      y?: number;
      rotation?: number;
    },
  ): Promise<MuralNoteDto> {
    const atual = await this.prisma.muralNote.findFirst({
      where: { id, deletedAt: null },
    });
    if (!atual) throw new NotFoundException('Bilhete não encontrado.');
    if (atual.authorUserId !== actor.userId) {
      throw new ForbiddenException('Só quem escreveu pode alterar o bilhete.');
    }

    const note = await this.prisma.muralNote.update({
      where: { id },
      data: {
        ...(data.message != null ? { message: data.message.trim() } : {}),
        ...(data.color != null ? { color: normalizarCor(data.color) } : {}),
        ...(data.toUserId !== undefined
          ? { toUserId: data.toUserId?.trim() || null }
          : {}),
        ...(data.anonymous != null ? { anonymous: data.anonymous } : {}),
        ...(data.x != null ? { x: clamp01(data.x, atual.x) } : {}),
        ...(data.y != null ? { y: clamp01(data.y, atual.y) } : {}),
        ...(data.rotation != null ? { rotation: inclinacao(data.rotation) } : {}),
      },
      include: {
        author: { select: { name: true } },
        recipient: { select: { name: true } },
        reactions: { select: { emoji: true, userId: true } },
      },
    });
    return this.mapear(note, actor);
  }

  /** Tira do mural sem apagar do banco: o rastro do autor continua. */
  async remover(actor: Actor, id: string): Promise<{ ok: true }> {
    const atual = await this.prisma.muralNote.findFirst({
      where: { id, deletedAt: null },
    });
    if (!atual) throw new NotFoundException('Bilhete não encontrado.');
    const podeRemover =
      atual.authorUserId === actor.userId || actor.role === UserRole.ADMIN;
    if (!podeRemover) {
      throw new ForbiddenException(
        'Só quem escreveu, ou um administrador, pode tirar o bilhete.',
      );
    }
    await this.prisma.muralNote.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { ok: true };
  }
}
