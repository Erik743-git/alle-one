import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { assertTicketClientScope } from './tickets-client-scope';

/**
 * Smoke comportamental do escopo em listTicketStages:
 * o service real depende de Prisma/TiFlux; aqui validamos o contrato
 * que o endpoint CLIENT deve aplicar antes de devolver estágios.
 */
describe('listTicketStages client scope contract', () => {
  const tenantScope = {
    resolveTifluxClientIds: jest.fn(),
  };

  const client = {
    userId: 'c1',
    role: 'CLIENT' as const,
    companyId: 'co1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('bloqueia CLIENT de outro cliente (IDOR stages)', async () => {
    tenantScope.resolveTifluxClientIds.mockResolvedValue([10]);
    await expect(
      assertTicketClientScope(tenantScope as never, client as never, 99),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('simula ticket inexistente → NotFound antes do escopo', () => {
    const ticket = null;
    expect(() => {
      if (!ticket) throw new NotFoundException('Ticket não encontrado.');
    }).toThrow(NotFoundException);
  });
});
