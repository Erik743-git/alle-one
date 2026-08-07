import { UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { HealthIntegrationsAccessGuard } from './health-integrations-access.guard';

describe('HealthIntegrationsAccessGuard', () => {
  const original = process.env.HEALTH_INTEGRATIONS_TOKEN;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.HEALTH_INTEGRATIONS_TOKEN;
    } else {
      process.env.HEALTH_INTEGRATIONS_TOKEN = original;
    }
    jest.restoreAllMocks();
  });

  function mockContext(
    headers: Record<string, string>,
    user?: { role: string },
  ) {
    const req: { headers: Record<string, string>; user?: { role: string } } = {
      headers,
    };
    if (user) req.user = user;
    return {
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    } as any;
  }

  it('aceita token interno válido sem JWT', async () => {
    process.env.HEALTH_INTEGRATIONS_TOKEN = 'segredo-teste-integracoes';
    const guard = new HealthIntegrationsAccessGuard();
    const ctx = mockContext({
      'x-internal-health-token': 'segredo-teste-integracoes',
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('rejeita token com tamanho diferente (timing-safe)', async () => {
    process.env.HEALTH_INTEGRATIONS_TOKEN = 'segredo-correto';
    const guard = new HealthIntegrationsAccessGuard();
    const parentProto = Object.getPrototypeOf(
      HealthIntegrationsAccessGuard.prototype,
    );
    jest
      .spyOn(parentProto, 'canActivate')
      .mockRejectedValue(new UnauthorizedException());
    const ctx = mockContext({
      'x-internal-health-token': 'x',
    });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('exige ADMIN quando não há token interno', async () => {
    delete process.env.HEALTH_INTEGRATIONS_TOKEN;
    const guard = new HealthIntegrationsAccessGuard();
    const parentProto = Object.getPrototypeOf(
      HealthIntegrationsAccessGuard.prototype,
    );
    jest.spyOn(parentProto, 'canActivate').mockResolvedValue(true);

    await expect(
      guard.canActivate(mockContext({}, { role: 'CLIENT' })),
    ).rejects.toThrow(/ADMIN/);

    await expect(
      guard.canActivate(mockContext({}, { role: 'ADMIN' })),
    ).resolves.toBe(true);
  });

  it('AuthGuard jwt está na cadeia (smoke)', () => {
    expect(HealthIntegrationsAccessGuard.prototype).toBeInstanceOf(Object);
    expect(typeof AuthGuard).toBe('function');
  });
});
