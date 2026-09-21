import type { Prisma } from '@prisma/client';

/**
 * Busca da lista de tickets.
 *
 * O título das rotinas é "[ROTINAS] [Tuper] Movimentação de fitas": procurar
 * a frase inteira não achava nada, porque os colchetes ficam no meio do que
 * a pessoa digita. Cada palavra passa a ser procurada por conta própria.
 */
function montarBuscaPorTitulo(search: string): Prisma.PortalTicketWhereInput {
  const palavras = search.split(/\s+/).filter(Boolean);
  return {
    AND: palavras.map((palavra) => ({
      title: { contains: palavra, mode: 'insensitive' as const },
    })),
  };
}

/** Simula o `contains` do banco sobre um título. */
function casa(titulo: string, busca: string): boolean {
  const where = montarBuscaPorTitulo(busca);
  const condicoes = (where.AND ?? []) as Array<{
    title: { contains: string };
  }>;
  return condicoes.every((c) =>
    titulo.toLowerCase().includes(c.title.contains.toLowerCase()),
  );
}

describe('busca da lista de tickets', () => {
  const TITULO = '[ROTINAS] [Tuper] Movimentação de fitas';

  it('acha mesmo com os colchetes no meio das palavras', () => {
    expect(casa(TITULO, 'Tuper Movimentação de fitas')).toBe(true);
  });

  it('acha em qualquer ordem', () => {
    expect(casa(TITULO, 'fitas tuper')).toBe(true);
  });

  it('não acha quando falta uma das palavras no título', () => {
    expect(casa(TITULO, 'tuper backup')).toBe(false);
  });

  it('ignora espaço sobrando', () => {
    expect(casa(TITULO, '  tuper   fitas  ')).toBe(true);
  });
});
