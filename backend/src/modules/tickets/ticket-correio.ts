import type { Logger } from '@nestjs/common';
import { MailboxNotificationKind, Prisma, UserStatus } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * Aviso no Correio sobre chamado: para o solicitante quando outra pessoa
 * abre um chamado para ele, e para quem vira responsável.
 *
 * Só no Correio: o e-mail ao novo responsável já existe e não muda; não há
 * e-mail novo. Rotina nunca avisa — quem chama o serviço pela rotina não liga
 * a opção. Combinado em docs/desenho/APONTAMENTOS-TELAS-ADMIN.md.
 */

function tituloLimpo(titulo: string | null | undefined): string {
  // Sem o ponto final do título, para não sair "..": a frase já termina em ponto.
  const t = (titulo ?? '').trim().replace(/[.\s]+$/, '');
  return t || 'sem título';
}

export function textoChamadoAberto(
  numero: number,
  titulo: string | null | undefined,
  abertoPor: string,
): string {
  return `Chamado #${numero} aberto para você: ${tituloLimpo(titulo)}. Aberto por ${abertoPor}.`;
}

export function textoNovoResponsavel(
  numero: number,
  titulo: string | null | undefined,
  atribuidoPor: string,
): string {
  return `Você agora é o responsável pelo chamado #${numero}: ${tituloLimpo(titulo)}. Atribuído por ${atribuidoPor}.`;
}

/**
 * Avisa o solicitante? Só quando outra pessoa abriu. Quem abre o próprio
 * chamado não recebe aviso do que acabou de fazer.
 */
export function deveAvisarSolicitante(params: {
  ligado: boolean | undefined;
  emailSolicitante: string | null | undefined;
  emailAtor: string | null | undefined;
}): boolean {
  if (!params.ligado) return false;
  const solicitante = params.emailSolicitante?.trim().toLowerCase() ?? '';
  if (!solicitante) return false;
  return solicitante !== (params.emailAtor?.trim().toLowerCase() ?? '');
}

/**
 * Grava o aviso para o usuário com esse e-mail — só se ele tiver login no
 * portal (e-mail de fora não tem Correio). Nunca lança: roda depois de o
 * chamado estar salvo, e erro aqui vira log.
 */
export async function avisarNoCorreio(
  prisma: PrismaService,
  logger: Logger,
  params: {
    email: string | null | undefined;
    kind: MailboxNotificationKind;
    texto: string;
    ticketNumber: number;
    dedupeKey: string;
  },
): Promise<boolean> {
  const email = params.email?.trim();
  if (!email) return false;
  try {
    const usuario = await prisma.user.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
        deletedAt: null,
        status: UserStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (!usuario) return false;

    await prisma.mailboxNotification.create({
      data: {
        userId: usuario.id,
        kind: params.kind,
        // A frase inteira no título: é o texto combinado, e o Correio mostra
        // o título em destaque.
        title: params.texto.slice(0, 200),
        body: '',
        href: `/tickets/${params.ticketNumber}`,
        dedupeKey: params.dedupeKey,
      },
    });
    return true;
  } catch (err) {
    // Mesmo aviso de novo (mesma chave): não é erro.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      return false;
    }
    logger.warn(
      `Aviso no Correio não gravado (#${params.ticketNumber}): ${
        err instanceof Error ? err.message : err
      }`,
    );
    return false;
  }
}
