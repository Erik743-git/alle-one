import { RedisService } from './redis.service';

describe('RedisService JSON helpers', () => {
  const originalUrl = process.env.REDIS_URL;

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = originalUrl;
  });

  it('getJson/setJson/del são no-op sem Redis habilitado', async () => {
    delete process.env.REDIS_URL;
    const service = new RedisService();
    service.onModuleInit();
    expect(service.isEnabled()).toBe(false);
    await expect(service.getJson('k')).resolves.toBeNull();
    await expect(service.setJson('k', { a: 1 }, 10)).resolves.toBeUndefined();
    await expect(service.del('k')).resolves.toBeUndefined();
    await expect(service.ping()).resolves.toBe('disabled');
  });

  it('getJson/setJson usam o client quando habilitado', async () => {
    const service = new RedisService();
    const client = {
      get: jest.fn().mockResolvedValue(JSON.stringify({ ok: true })),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      ping: jest.fn().mockResolvedValue('PONG'),
    };
    (service as unknown as { client: typeof client; enabled: boolean }).client =
      client;
    (service as unknown as { enabled: boolean }).enabled = true;

    await expect(service.getJson<{ ok: boolean }>('dash')).resolves.toEqual({
      ok: true,
    });
    await service.setJson('dash', { ok: false }, 30);
    expect(client.set).toHaveBeenCalledWith(
      'dash',
      JSON.stringify({ ok: false }),
      'EX',
      30,
    );
    await service.del('dash');
    expect(client.del).toHaveBeenCalledWith('dash');
  });
});
