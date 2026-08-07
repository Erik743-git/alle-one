import { cleanupExpiredExternalApiCache } from './external-api-cache.cleanup';

describe('cleanupExpiredExternalApiCache', () => {
  it('retorna 0 se o banco falhar', async () => {
    const prisma = {
      $executeRawUnsafe: jest.fn().mockRejectedValue(new Error('db down')),
    };
    await expect(
      cleanupExpiredExternalApiCache(prisma as never, 100),
    ).resolves.toBe(0);
  });

  it('propaga contagem de linhas removidas', async () => {
    const prisma = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(12),
    };
    await expect(
      cleanupExpiredExternalApiCache(prisma as never, 100),
    ).resolves.toBe(12);
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM external_api_cache'),
      100,
    );
  });

  it('limita o batch entre 1 e 5000', async () => {
    const prisma = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
    };
    await cleanupExpiredExternalApiCache(prisma as never, 0);
    expect(prisma.$executeRawUnsafe).toHaveBeenLastCalledWith(
      expect.any(String),
      1,
    );
    await cleanupExpiredExternalApiCache(prisma as never, 99_999);
    expect(prisma.$executeRawUnsafe).toHaveBeenLastCalledWith(
      expect.any(String),
      5_000,
    );
  });
});
