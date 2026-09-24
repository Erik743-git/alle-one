import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import {
  modulosDesligados,
  problemaNaLinha,
  type LinhaAcesso,
} from './acesso-regras';
import { MODULOS_PORTAL } from './modulos-portal';

/** A tabela muda pouco; 30 s é o mesmo prazo do cache de permissões. */
const TTL_MS = 30_000;

@Injectable()
export class AcessoService {
  private cache: { linhas: LinhaAcesso[]; ate: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private async linhas(): Promise<LinhaAcesso[]> {
    const agora = Date.now();
    if (this.cache && this.cache.ate > agora) return this.cache.linhas;
    const linhas = await this.prisma.acessoModulo.findMany({
      select: {
        chave: true,
        emConstrucao: true,
        colaborador: true,
        terceiro: true,
        clienteGestor: true,
        clienteMembro: true,
      },
    });
    this.cache = { linhas, ate: agora + TTL_MS };
    return linhas;
  }

  async desligadosPara(role: string): Promise<string[]> {
    return modulosDesligados(role, await this.linhas());
  }

  async liberado(role: string, chave: string): Promise<boolean> {
    return !(await this.desligadosPara(role)).includes(chave);
  }

  /** Tela do admin: catálogo + estado atual, na ordem do menu. */
  async listar() {
    const porChave = new Map(
      (await this.prisma.acessoModulo.findMany()).map((l) => [l.chave, l]),
    );
    return MODULOS_PORTAL.map((m) => {
      const l = porChave.get(m.chave);
      return {
        chave: m.chave,
        nome: m.nome,
        perfisPossiveis: m.perfisPossiveis,
        emConstrucao: l?.emConstrucao ?? true,
        colaborador: l?.colaborador ?? false,
        terceiro: l?.terceiro ?? false,
        clienteGestor: l?.clienteGestor ?? false,
        clienteMembro: l?.clienteMembro ?? false,
        updatedAt: l?.updatedAt ?? null,
      };
    });
  }

  async salvar(userId: string, linha: LinhaAcesso) {
    const problema = problemaNaLinha(linha);
    if (problema) throw new BadRequestException(problema);
    const dados = {
      emConstrucao: linha.emConstrucao,
      colaborador: linha.colaborador,
      terceiro: linha.terceiro,
      clienteGestor: linha.clienteGestor,
      clienteMembro: linha.clienteMembro,
      updatedBy: userId,
    };
    await this.prisma.acessoModulo.upsert({
      where: { chave: linha.chave },
      create: { chave: linha.chave, ...dados },
      update: dados,
    });
    this.cache = null;
    return this.listar();
  }
}
