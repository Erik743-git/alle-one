import { RendimentoOvertimeBalanceService } from './rendimento-overtime-balance.service';

describe('RendimentoOvertimeBalanceService', () => {
  const service = new RendimentoOvertimeBalanceService({
    rendimentoOvertimeBalance: {
      findUnique: jest.fn(),
    },
    $executeRawUnsafe: jest.fn(),
    $queryRawUnsafe: jest.fn(),
  } as any);

  it('calcula saldo líquido: HE período − protegidas − débitos', () => {
    expect(service.getNetBalanceMinutes(390, 390, 0)).toBe(0);
    expect(service.getNetBalanceMinutes(150, 390, 0)).toBe(-240);
    expect(service.getNetBalanceMinutes(390, 0, 120)).toBe(270);
  });

  it('refreshBalance consulta protegidas e débitos no mesmo intervalo', async () => {
    const prisma = {
      rendimentoOvertimeBalance: { findUnique: jest.fn() },
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([{ total: 390 }])
        .mockResolvedValueOnce([{ total: 0 }]),
    };
    const svc = new RendimentoOvertimeBalanceService(prisma as any);
    const start = new Date('2026-08-26T00:00:00');
    const end = new Date('2026-09-25T00:00:00');

    const balance = await svc.refreshBalance('user-1', 390, start, end);

    expect(balance).toBe(0);
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
    const protectedArgs = prisma.$queryRawUnsafe.mock.calls[0].slice(1);
    const debitedArgs = prisma.$queryRawUnsafe.mock.calls[1].slice(1);
    expect(protectedArgs[1]).toBe('2026-08-26');
    expect(protectedArgs[2]).toBe('2026-09-25');
    expect(debitedArgs[1]).toBe('2026-08-26');
    expect(debitedArgs[2]).toBe('2026-09-25');
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.any(String),
      'user-1',
      0,
    );
  });
});
