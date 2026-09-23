import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';

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
    },
    actor: Actor,
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

  async listar(actor: Actor): Promise<MuralNoteDto[]> {
    const notes = await this.prisma.muralNote.findMany({
      where: { deletedAt: null },
      include: {
        author: { select: { name: true } },
        recipient: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return notes.map((note) => this.mapear(note, actor));
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
      },
    });
    return this.mapear(note, actor);
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
