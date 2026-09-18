import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Estado da tela é pequeno; o limite evita gravar lixo grande por engano. */
const MAX_STATE_BYTES = 64_000;

/**
 * Estado da tela de tickets de cada usuário (filtros, colunas, larguras,
 * agrupamento, ordenação, filtro salvo ativo). A tela grava a cada mudança e
 * restaura ao abrir — sobrevive a logout, F5 e troca de navegador.
 */
@Injectable()
export class TicketListStateService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<{ state: Prisma.JsonValue | null }> {
    const row = await this.prisma.ticketListUserState.findUnique({
      where: { userId },
      select: { state: true },
    });
    return { state: row?.state ?? null };
  }

  async save(userId: string, state: unknown): Promise<{ ok: true }> {
    if (state == null || typeof state !== 'object' || Array.isArray(state)) {
      throw new BadRequestException('Estado da tela inválido.');
    }
    const json = JSON.stringify(state);
    if (Buffer.byteLength(json, 'utf8') > MAX_STATE_BYTES) {
      throw new BadRequestException('Estado da tela grande demais.');
    }
    const value = JSON.parse(json) as Prisma.InputJsonObject;
    await this.prisma.ticketListUserState.upsert({
      where: { userId },
      create: { userId, state: value },
      update: { state: value },
    });
    return { ok: true };
  }
}
